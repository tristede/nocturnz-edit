import { describe, expect, it } from 'vitest';
import type { ApplyResult, HostAdapter } from '../adapters/HostAdapter';
import type { SequenceInfo } from '../operations/model';
import type { OperationBatch } from '../operations/schema';
import { defaultSettings } from '../lib/settings';
import { analyzeSilence, applySilenceCuts } from './pipeline';

function makeWav(parts: Array<{ sec: number; amp: number }>, sr = 16000): ArrayBuffer {
  const total = parts.reduce((s, p) => s + Math.round(p.sec * sr), 0);
  const buf = new ArrayBuffer(44 + total * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + total * 2, true); w(8, 'WAVE');
  w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, total * 2, true);
  let i = 0;
  for (const p of parts) for (let k = 0; k < Math.round(p.sec * sr); k++) {
    v.setInt16(44 + i++ * 2, Math.round(p.amp * 32767 * Math.sin((2 * Math.PI * 220 * k) / sr)), true);
  }
  return buf;
}

function fakeHost(
  seqs: SequenceInfo[],
  options?: { applyOperationsBehavior?: (batch: OperationBatch, batchIndex: number) => ApplyResult },
): HostAdapter & { batches: OperationBatch[]; callCounts: { getSequenceInfo: number; applyOperations: number } } {
  let call = 0;
  let batchIndex = 0;
  const batches: OperationBatch[] = [];
  const callCounts = { getSequenceInfo: 0, applyOperations: 0 };
  return {
    batches,
    callCounts,
    ping: async () => true,
    getSequenceInfo: async () => {
      callCounts.getSequenceInfo++;
      return seqs[Math.min(call++, seqs.length - 1)]!;
    },
    exportAudio: async () => '/tmp/fake.wav',
    applyOperations: async (b): Promise<ApplyResult> => {
      callCounts.applyOperations++;
      batches.push(b);
      if (options?.applyOperationsBehavior) {
        return options.applyOperationsBehavior(b, batchIndex++);
      }
      return { ok: true, applied: b.ops.length };
    },
  };
}

const SEQ_BEFORE: SequenceInfo = {
  name: 's', endSec: 4, fps: 30, audioTracks: [],
  videoTracks: [{ index: 0, name: 'V1', clips: [{ index: 0, nodeId: 'a', name: '', startSec: 0, endSec: 4, enabled: true }] }],
};
const SEQ_AFTER_RAZOR: SequenceInfo = {
  ...SEQ_BEFORE,
  videoTracks: [{ index: 0, name: 'V1', clips: [
    { index: 0, nodeId: 'a1', name: '', startSec: 0, endSec: 1, enabled: true },
    { index: 1, nodeId: 'a2', name: '', startSec: 1, endSec: 3, enabled: true },
    { index: 2, nodeId: 'a3', name: '', startSec: 3, endSec: 4, enabled: true },
  ] }],
};

describe('silence pipeline', () => {
  const settings = { ...defaultSettings(), wavPresetPath: '/p.epr' };
  const wav = makeWav([{ sec: 1, amp: 0.5 }, { sec: 2, amp: 0.001 }, { sec: 1, amp: 0.5 }]);

  it('analyzes exported audio into cut ranges', async () => {
    const host = fakeHost([SEQ_BEFORE]);
    const a = await analyzeSilence(host, { ...settings, silence: { ...settings.silence, paddingMs: 0 } }, {
      readFileBuf: async () => wav, tmpDir: '/tmp',
    });
    expect(a.ranges).toHaveLength(1);
    expect(a.totalCutSec).toBeGreaterThan(1.5);
  });

  it('applies razors then deletes in two phases', async () => {
    // fake applyOperations does not itself refetch, so getSequenceInfo call order is:
    // analyze (SEQ_BEFORE), post-razor refetch (SEQ_AFTER_RAZOR)
    const host = fakeHost([SEQ_BEFORE, SEQ_AFTER_RAZOR]);
    const a = await analyzeSilence(host, { ...settings, silence: { ...settings.silence, paddingMs: 0 } }, {
      readFileBuf: async () => wav, tmpDir: '/tmp',
    });
    const r = await applySilenceCuts(host, a, a.ranges);
    expect(r.ok).toBe(true);
    expect(host.batches[0]!.ops.every((o) => o.type === 'razorAll')).toBe(true);
    expect(host.batches[1]!.ops).toHaveLength(1); // the [1,3] silent clip
    expect(host.batches[1]!.ops.every((o) => o.type === 'rippleDelete')).toBe(true);
  });

  it('phase 2 failure preserves phase 1 applied count', async () => {
    const host = fakeHost([SEQ_BEFORE, SEQ_AFTER_RAZOR], {
      applyOperationsBehavior: (b, batchIndex) => {
        if (batchIndex === 0) {
          return { ok: true, applied: 3 }; // phase 1 succeeds with 3 applied
        }
        return { ok: false, applied: 0, error: 'boom' }; // phase 2 fails
      },
    });

    const a = await analyzeSilence(host, { ...settings, silence: { ...settings.silence, paddingMs: 0 } }, {
      readFileBuf: async () => wav, tmpDir: '/tmp',
    });
    const r = await applySilenceCuts(host, a, a.ranges);

    expect(r.ok).toBe(false);
    expect(r.applied).toBe(3); // phase 1 applied count preserved despite phase 2 failure
    expect(r.error).toBe('boom');
  });

  it('hash mismatch on phase 1 aborts without phase 2', async () => {
    const host = fakeHost([SEQ_BEFORE], {
      applyOperationsBehavior: () => {
        return { ok: false, applied: 0, error: 'sequence changed since analysis — re-run analysis before applying' };
      },
    });

    const a = await analyzeSilence(host, { ...settings, silence: { ...settings.silence, paddingMs: 0 } }, {
      readFileBuf: async () => wav, tmpDir: '/tmp',
    });
    const applyOpsCountBefore = host.callCounts.applyOperations;
    const getSeqCountBefore = host.callCounts.getSequenceInfo;

    const r = await applySilenceCuts(host, a, a.ranges);

    expect(r.ok).toBe(false);
    expect(r.error).toContain('sequence changed');
    expect(host.callCounts.applyOperations).toBe(applyOpsCountBefore + 1); // only 1 phase 1 call, no phase 2
    expect(host.callCounts.getSequenceInfo).toBe(getSeqCountBefore); // no additional getSequenceInfo calls
  });
});
