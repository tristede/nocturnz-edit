import { describe, expect, it } from 'vitest';
import { DEFAULT_SILENCE_CONFIG, detectSilence } from './detect';

const SR = 16000;
function signal(parts: Array<{ sec: number; amp: number }>): Float32Array {
  const total = parts.reduce((s, p) => s + p.sec, 0);
  const out = new Float32Array(Math.round(total * SR));
  let i = 0;
  for (const p of parts) {
    const n = Math.round(p.sec * SR);
    for (let k = 0; k < n; k++) out[i++] = p.amp * Math.sin((2 * Math.PI * 220 * k) / SR);
  }
  return out;
}

describe('detectSilence', () => {
  const cfg = { ...DEFAULT_SILENCE_CONFIG, paddingMs: 0 };
  it('finds a long middle silence', () => {
    const s = signal([{ sec: 1, amp: 0.5 }, { sec: 2, amp: 0.001 }, { sec: 1, amp: 0.5 }]);
    const r = detectSilence(s, SR, cfg);
    expect(r).toHaveLength(1);
    expect(r[0]!.startSec).toBeCloseTo(1, 1);
    expect(r[0]!.endSec).toBeCloseTo(3, 1);
  });
  it('ignores silences shorter than minSilenceMs', () => {
    const s = signal([{ sec: 1, amp: 0.5 }, { sec: 0.3, amp: 0.001 }, { sec: 1, amp: 0.5 }]);
    expect(detectSilence(s, SR, cfg)).toHaveLength(0);
  });
  it('applies padding', () => {
    const s = signal([{ sec: 1, amp: 0.5 }, { sec: 2, amp: 0.001 }, { sec: 1, amp: 0.5 }]);
    const r = detectSilence(s, SR, { ...cfg, paddingMs: 200 });
    expect(r[0]!.startSec).toBeCloseTo(1.2, 1);
    expect(r[0]!.endSec).toBeCloseTo(2.8, 1);
  });
  it('merges ranges separated by a too-short loud island', () => {
    const s = signal([
      { sec: 1, amp: 0.5 }, { sec: 1, amp: 0.001 }, { sec: 0.1, amp: 0.5 },
      { sec: 1, amp: 0.001 }, { sec: 1, amp: 0.5 },
    ]);
    const r = detectSilence(s, SR, cfg);
    expect(r).toHaveLength(1);
  });
});
