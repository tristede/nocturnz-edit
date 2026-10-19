import { describe, expect, it } from 'vitest';
import { TICKS_PER_SECOND, secondsToTicks, ticksToSeconds } from './time';

describe('ticks conversion', () => {
  it('has the Premiere ticks constant', () => {
    expect(TICKS_PER_SECOND).toBe(254016000000);
  });
  it('round-trips seconds', () => {
    expect(secondsToTicks(1)).toBe('254016000000');
    expect(ticksToSeconds('508032000000')).toBe(2);
    expect(ticksToSeconds(secondsToTicks(3.5))).toBeCloseTo(3.5, 9);
  });
});
