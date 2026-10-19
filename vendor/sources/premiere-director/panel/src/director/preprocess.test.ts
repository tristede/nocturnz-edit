import { describe, expect, it } from 'vitest';
import { mergeUtterances } from './preprocess';

const u = (startSec: number, endSec: number, speakerId: string, text = 'x') => ({ startSec, endSec, speakerId, text });

describe('mergeUtterances', () => {
  it('bridges small same-speaker gaps', () => {
    const out = mergeUtterances([u(0, 0.5, 'A', 'hi'), u(0.7, 1.6, 'A', 'there')], 0.3);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ startSec: 0, endSec: 1.6, speakerId: 'A', text: 'hi there' });
  });
  it('does not bridge across speakers or large gaps', () => {
    expect(mergeUtterances([u(0, 0.5, 'A'), u(0.6, 1, 'B')], 0.3)).toHaveLength(2);
    expect(mergeUtterances([u(0, 0.5, 'A'), u(1.5, 2, 'A')], 0.3)).toHaveLength(2);
  });
  it('sorts unsorted input', () => {
    const out = mergeUtterances([u(5, 6, 'B'), u(0, 1, 'A')], 0.3);
    expect(out[0]!.speakerId).toBe('A');
  });
});
