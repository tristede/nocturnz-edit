import { describe, expect, it } from 'vitest';
import type { SequenceInfo } from '../operations/model';
import { CepAdapter, sequenceHash } from './CepAdapter';

const SEQ: SequenceInfo = {
  name: 's', endSec: 10, fps: 30,
  videoTracks: [{ index: 0, name: 'V1', clips: [{ index: 0, nodeId: 'a', name: '', startSec: 0, endSec: 10, enabled: true }] }],
  audioTracks: [],
};

function fakeEval(responses: Record<string, string>) {
  const calls: string[] = [];
  const fn = (script: string, cb: (r: string) => void) => {
    calls.push(script);
    const key = Object.keys(responses).find((k) => script.startsWith(k));
    cb(key ? responses[key]! : 'EvalScript error.');
  };
  return { fn, calls };
}

describe('CepAdapter', () => {
  it('parses sequence info', async () => {
    const { fn } = fakeEval({ PD_getSequenceInfo: JSON.stringify(SEQ) });
    const a = new CepAdapter(fn);
    expect((await a.getSequenceInfo()).name).toBe('s');
  });
  it('throws on host error payloads and EvalScript errors', async () => {
    const { fn } = fakeEval({ PD_getSequenceInfo: JSON.stringify({ error: 'No active sequence' }) });
    await expect(new CepAdapter(fn).getSequenceInfo()).rejects.toThrow(/no active sequence/i);
    const bad = fakeEval({});
    await expect(new CepAdapter(bad.fn).getSequenceInfo()).rejects.toThrow(/evalscript/i);
  });
  it('rejects invalid batches before touching the host', async () => {
    const { fn, calls } = fakeEval({});
    const r = await new CepAdapter(fn).applyOperations({ ops: [{ type: 'nope' } as never] });
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
  it('aborts apply when the sequence hash changed', async () => {
    const { fn, calls } = fakeEval({ PD_getSequenceInfo: JSON.stringify(SEQ) });
    const r = await new CepAdapter(fn).applyOperations({ ops: [{ type: 'razorAll', timeSec: 1 }] }, 'stale-hash');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/changed/i);
    expect(calls.some((c) => c.startsWith('PD_execute'))).toBe(false);
  });
  it('executes valid batches with matching hash', async () => {
    const { fn } = fakeEval({
      PD_getSequenceInfo: JSON.stringify(SEQ),
      PD_execute: JSON.stringify({ ok: true, applied: 1 }),
    });
    const r = await new CepAdapter(fn).applyOperations({ ops: [{ type: 'razorAll', timeSec: 1 }] }, sequenceHash(SEQ));
    expect(r).toEqual({ ok: true, applied: 1 });
  });
});
