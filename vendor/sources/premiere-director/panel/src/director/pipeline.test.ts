import { describe, expect, it } from 'vitest';
import type { ApplyResult, HostAdapter } from '../adapters/HostAdapter';
import type { SequenceInfo } from '../operations/model';
import type { OperationBatch } from '../operations/schema';
import { defaultSettings } from '../lib/settings';
import { DEFAULT_DIRECTOR_CONFIG } from './types';
import { analyzeDialogue, applyCameraAssignment, applyCameraCuts, autoAssignCameras, planCameraCuts } from './pipeline';

const WHISPER_JSON = JSON.stringify({
  transcription: [
    { offsets: { from: 0, to: 3000 }, text: ' Long opening statement here.' },
    { offsets: { from: 3200, to: 6000 }, text: ' And a long reply as well.' },
  ],
});
const DIAR = '0.0 -- 3.1 speaker_00\n3.1 -- 6.0 speaker_01\n';

function twoTrackSeq(clipsPerTrack: Array<Array<[number, number]>>): SequenceInfo {
  return {
    name: 's', endSec: 6, fps: 30, audioTracks: [],
    videoTracks: clipsPerTrack.map((clips, t) => ({
      index: t, name: `V${t + 1}`,
      clips: clips.map(([s, e], i) => ({ index: i, nodeId: `t${t}c${i}`, name: '', startSec: s, endSec: e, enabled: true })),
    })),
  };
}

function fakeHost(
  seqs: SequenceInfo[],
  options?: { applyOperationsBehavior?: (batch: OperationBatch, batchIndex: number) => ApplyResult },
) {
  let call = 0;
  let batchIndex = 0;
  const batches: OperationBatch[] = [];
  const host: HostAdapter & { batches: OperationBatch[] } = {
    batches,
    ping: async () => true,
    getSequenceInfo: async () => seqs[Math.min(call++, seqs.length - 1)]!,
    exportAudio: async () => '/tmp/fake.wav',
    applyOperations: async (b): Promise<ApplyResult> => {
      batches.push(b);
      if (options?.applyOperationsBehavior) {
        return options.applyOperationsBehavior(b, batchIndex++);
      }
      return { ok: true, applied: b.ops.length };
    },
  };
  return host;
}

const deps = {
  run: async () => ({ exitCode: 0, stdout: DIAR, stderr: '' }),
  readFile: async () => WHISPER_JSON,
  readFileBuf: async () => new ArrayBuffer(0),
  tmpDir: '/tmp',
};
const settings = {
  ...defaultSettings(), wavPresetPath: '/p.epr',
  whisperBinPath: '/w', whisperModelPath: '/m',
  diarizeBinPath: '/d', diarizeSegModelPath: '/s', diarizeEmbModelPath: '/e',
};

describe('autoAssignCameras', () => {
  // 6s WAV at 1kHz mono with loud audio only inside [loudFrom, loudTo).
  function wavLoudDuring(loudFrom: number, loudTo: number): ArrayBuffer {
    const sr = 1000;
    const n = 6 * sr;
    const buf = new ArrayBuffer(44 + n * 2);
    const v = new DataView(buf);
    const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE');
    w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    w(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const amp = t >= loudFrom && t < loudTo ? 0.8 : 0.02;
      v.setInt16(44 + i * 2, Math.round(amp * 32767 * Math.sin((2 * Math.PI * 200 * i) / sr)), true);
    }
    return buf;
  }

  it('solos each camera mic, measures speaker turns, assigns, and restores mutes', async () => {
    // Cameras with matching scratch-audio names; A2 starts muted by the user.
    const seq: SequenceInfo = {
      name: 's', endSec: 6, fps: 30,
      videoTracks: [
        { index: 0, name: 'V1', clips: [{ index: 0, nodeId: 'v0', name: 'camA.mov', startSec: 0, endSec: 6, enabled: true }] },
        { index: 1, name: 'V2', clips: [{ index: 0, nodeId: 'v1', name: 'camB.mov', startSec: 0, endSec: 6, enabled: true }] },
      ],
      audioTracks: [
        { index: 0, name: 'A1', muted: false, clips: [{ index: 0, nodeId: 'a0', name: 'camA.mov', startSec: 0, endSec: 6, enabled: true }] },
        { index: 1, name: 'A2', muted: true, clips: [{ index: 0, nodeId: 'a1', name: 'camB.mov', startSec: 0, endSec: 6, enabled: true }] },
      ],
    };
    const host = fakeHost([seq, seq, seq]);
    const a = await analyzeDialogue(host, settings, deps); // spk00: 0-3.1, spk01: 3.1-6
    // camA solo export is loud while spk00 talks; camB solo export loud while spk01 talks.
    const wavs = [wavLoudDuring(0, 3.1), wavLoudDuring(3.1, 6)];
    let exportCount = 0;
    const autoDeps = { readFileBuf: async () => wavs[exportCount++]!, tmpDir: '/tmp' };

    const r = await autoAssignCameras(host, a, settings, autoDeps);
    expect(r.assignments).toEqual({ speaker_00: 0, speaker_01: 1 });
    expect(r.confidence.speaker_00).toBeGreaterThan(0.5);

    // Batches: solo-A1, solo-A2, restore. All setTrackMute only.
    const muteBatches = host.batches.filter((b) => b.ops.every((o) => o.type === 'setTrackMute'));
    expect(muteBatches).toHaveLength(3);
    const restore = muteBatches[2]!.ops;
    expect(restore).toContainEqual({ type: 'setTrackMute', trackType: 'audio', trackIndex: 0, mute: false });
    expect(restore).toContainEqual({ type: 'setTrackMute', trackType: 'audio', trackIndex: 1, mute: true }); // user's mute preserved
  });
});

describe('applyCameraAssignment', () => {
  it('re-derives enables for a swapped mapping without razoring or hash-guarding', async () => {
    // Timeline already cut at 3.1 and enabled for the ORIGINAL mapping (00→V1, 01→V2).
    const cut: SequenceInfo = {
      name: 's', endSec: 6, fps: 30, audioTracks: [],
      videoTracks: [
        { index: 0, name: 'V1', clips: [
          { index: 0, nodeId: 'a', name: '', startSec: 0, endSec: 3.1, enabled: true },
          { index: 1, nodeId: 'b', name: '', startSec: 3.1, endSec: 6, enabled: false },
        ] },
        { index: 1, name: 'V2', clips: [
          { index: 0, nodeId: 'c', name: '', startSec: 0, endSec: 3.1, enabled: false },
          { index: 1, nodeId: 'd', name: '', startSec: 3.1, endSec: 6, enabled: true },
        ] },
      ],
    };
    const host = fakeHost([cut, cut]);
    const a = await analyzeDialogue(host, settings, deps);
    // User realizes the mapping was backwards: swap it.
    const swapped = { speakerToTrack: { speaker_00: 1, speaker_01: 0 }, wideTrackIndex: null };
    const r = await applyCameraAssignment(host, a, swapped, DEFAULT_DIRECTOR_CONFIG, 1);
    expect(r.ok).toBe(true);
    expect(host.batches).toHaveLength(1); // single enables batch — no razor batch
    const ops = host.batches[0]!.ops;
    expect(ops.every((o) => o.type === 'setClipEnabled')).toBe(true);
    expect(ops).toHaveLength(4); // every clip's enable flips
    expect(ops).toContainEqual({ type: 'setClipEnabled', trackType: 'video', trackIndex: 0, clipIndex: 0, enabled: false });
    expect(ops).toContainEqual({ type: 'setClipEnabled', trackType: 'video', trackIndex: 0, clipIndex: 1, enabled: true });
    expect(ops).toContainEqual({ type: 'setClipEnabled', trackType: 'video', trackIndex: 1, clipIndex: 0, enabled: true });
    expect(ops).toContainEqual({ type: 'setClipEnabled', trackType: 'video', trackIndex: 1, clipIndex: 1, enabled: false });
  });
});

describe('director pipeline', () => {
  it('produces speaker-labeled merged utterances', async () => {
    const a = await analyzeDialogue(fakeHost([twoTrackSeq([[[0, 6]], [[0, 6]]])]), settings, deps);
    expect(a.speakers.sort()).toEqual(['speaker_00', 'speaker_01']);
    expect(a.utterances).toHaveLength(2);
  });
  it('plans and applies cuts as razor batch + enable batch', async () => {
    const before = twoTrackSeq([[[0, 6]], [[0, 6]]]);
    const afterRazor = twoTrackSeq([[[0, 3.2], [3.2, 6]], [[0, 3.2], [3.2, 6]]]);
    // call order: analyze (before), post-razor refetch (afterRazor)
    const host = fakeHost([before, afterRazor]);
    const a = await analyzeDialogue(host, settings, deps);
    const map = { speakerToTrack: { speaker_00: 0, speaker_01: 1 }, wideTrackIndex: null };
    const switches = planCameraCuts(a, map, DEFAULT_DIRECTOR_CONFIG, 0);
    expect(switches).toHaveLength(1);
    const r = await applyCameraCuts(host, a, switches, map, 0);
    expect(r.ok).toBe(true);
    expect(host.batches[0]!.ops.every((o) => o.type === 'razorAll')).toBe(true);
    // V1 second half disabled, V2 first half disabled
    expect(host.batches[1]!.ops).toHaveLength(2);
    expect(host.batches[1]!.ops.every((o) => o.type === 'setClipEnabled')).toBe(true);
  });
  it('phase 2 failure preserves phase 1 applied count', async () => {
    const before = twoTrackSeq([[[0, 6]], [[0, 6]]]);
    const afterRazor = twoTrackSeq([[[0, 3.2], [3.2, 6]], [[0, 3.2], [3.2, 6]]]);
    const host = fakeHost([before, afterRazor], {
      applyOperationsBehavior: (b, batchIndex) => {
        if (batchIndex === 0) {
          return { ok: true, applied: 5 }; // phase 1 succeeds with 5 applied
        }
        return { ok: false, applied: 0, error: 'boom' }; // phase 2 fails
      },
    });
    const a = await analyzeDialogue(host, settings, deps);
    const map = { speakerToTrack: { speaker_00: 0, speaker_01: 1 }, wideTrackIndex: null };
    const switches = planCameraCuts(a, map, DEFAULT_DIRECTOR_CONFIG, 0);
    const r = await applyCameraCuts(host, a, switches, map, 0);
    expect(r.ok).toBe(false);
    expect(r.applied).toBe(5); // phase 1 applied count preserved despite phase 2 failure
    expect(r.error).toBe('boom');
  });
});
