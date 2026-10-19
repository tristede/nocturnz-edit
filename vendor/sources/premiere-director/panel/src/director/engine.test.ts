import { describe, expect, it } from 'vitest';
import { DEFAULT_DIRECTOR_CONFIG as CFG } from './types';
import { findCrosstalk, planSwitches } from './engine';

const u = (startSec: number, endSec: number, speakerId: string) => ({ startSec, endSec, speakerId, text: '' });
const MAP = { speakerToTrack: { A: 0, B: 1, C: null } as Record<string, number | null>, wideTrackIndex: null };

describe('planSwitches', () => {
  it('switches to a speaker who talks past the threshold', () => {
    const sw = planSwitches([u(0, 3, 'A'), u(3.2, 6, 'B')], MAP, CFG, 0);
    expect(sw).toEqual([{ timeSec: 3.2, toTrackIndex: 1, reason: expect.any(String) }]);
  });
  it('ignores brief remarks (< threshold)', () => {
    const sw = planSwitches([u(0, 3, 'A'), u(3.0, 3.5, 'B'), u(3.6, 7, 'A')], MAP, CFG, 0);
    expect(sw).toEqual([]);
  });
  it('holds when an off-camera speaker talks, regardless of duration', () => {
    const sw = planSwitches([u(0, 3, 'A'), u(3, 8, 'C')], MAP, CFG, 0);
    expect(sw).toEqual([]);
  });
  it('interrupt: holds on A unless B exceeds threshold', () => {
    // B interrupts A mid-utterance but only for 0.8s
    expect(planSwitches([u(0, 4, 'A'), u(2, 2.8, 'B')], MAP, CFG, 0)).toEqual([]);
    // B interrupts and keeps going for 2s -> cut to B
    const sw = planSwitches([u(0, 4, 'A'), u(2, 4.5, 'B')], MAP, CFG, 0);
    expect(sw).toEqual([{ timeSec: 2, toTrackIndex: 1, reason: expect.any(String) }]);
  });
  it('enforces minimum spacing between switches', () => {
    const sw = planSwitches([u(0, 1.5, 'B'), u(0.5, 2.1, 'A')], MAP, CFG, 0);
    // switch to B at 0; switch back to A no earlier than 1.0
    expect(sw[0]).toMatchObject({ timeSec: 0, toTrackIndex: 1 });
    expect(sw[1]!.timeSec).toBeGreaterThanOrEqual(1.0);
  });
  it('drops a switch whose legal time falls after the utterance ends', () => {
    const sw = planSwitches([u(0, 2, 'B'), u(0.5, 1.4, 'A')], MAP, CFG, 0);
    // A's window [1.0(spacing)..1.4) is fine, but A is only 0.9s -> under threshold anyway
    expect(sw).toHaveLength(1);
  });
  it('cuts to the wide shot during sustained crosstalk when a wide track exists', () => {
    const wide = { ...MAP, wideTrackIndex: 5 };
    const sw = planSwitches([u(0, 6, 'A'), u(2, 6, 'B')], wide, CFG, 0);
    // exactly one switch: to wide at t=2, and no cut back to a solo camera while
    // crosstalk is still active (i.e. inside [2, 6))
    expect(sw).toEqual([{ timeSec: 2, toTrackIndex: 5, reason: expect.any(String) }]);
  });
  it('drops a switch whose legal time lands at/after the utterance end (deadline enforced)', () => {
    const cfg = { ...CFG, minShotSec: 2 };
    // switch to B at 0; A's candidate time = max(0.5, 0+2) = 2, but A ends at 1.9 -> dropped
    const sw = planSwitches([u(0, 3, 'B'), u(0.5, 1.9, 'A')], MAP, cfg, 0);
    expect(sw).toHaveLength(1);
    expect(sw[0]).toMatchObject({ timeSec: 0, toTrackIndex: 1 });
  });
  it('does not let a late crosstalk window poison lastSwitch for earlier, unrelated switches', () => {
    const wide = { ...MAP, wideTrackIndex: 5 };
    // crosstalk window is [11, 14) (A vs B overlap), well after the B switch at t=0.
    // A time-ordered walk must not floor the t=0 switch using a lastSwitch value
    // computed from the later crosstalk window.
    const sw = planSwitches([u(0, 2, 'B'), u(10, 14, 'A'), u(11, 14, 'B')], wide, CFG, 0);
    expect(sw[0]).toMatchObject({ timeSec: 0, toTrackIndex: 1 });
    const wideSwitch = sw.find((s) => s.toTrackIndex === 5);
    expect(wideSwitch).toMatchObject({ timeSec: 11 });
    expect(sw.indexOf(sw[0]!)).toBeLessThan(sw.indexOf(wideSwitch!));
  });
  it('the pre-crosstalk speaker regains the camera once the crosstalk window ends', () => {
    const wide = { ...MAP, wideTrackIndex: 5 };
    // A starts alone (no-op switch, initial track is already 0), B interrupts at
    // t=2 producing crosstalk window [2, 4), and A keeps talking solo through
    // t=10 after the window closes. A must be re-evaluated at t=4 and get the
    // camera back instead of being stranded on the wide shot for 4..10.
    const sw = planSwitches([u(0, 10, 'A'), u(2, 4, 'B')], wide, CFG, 0);
    expect(sw.map(({ timeSec, toTrackIndex }) => ({ timeSec, toTrackIndex }))).toEqual([
      { timeSec: 2, toTrackIndex: 5 },
      { timeSec: 4, toTrackIndex: 0 },
    ]);
  });
  it('does not flap at window end when the interrupter also continues past it', () => {
    const wide = { ...MAP, wideTrackIndex: 5 };
    // Both A and B's utterances end exactly with the crosstalk window [2, 6) —
    // neither should get a resume event, so only the wide-shot switch survives.
    const sw = planSwitches([u(0, 6, 'A'), u(2, 6, 'B')], wide, CFG, 0);
    expect(sw).toEqual([{ timeSec: 2, toTrackIndex: 5, reason: expect.any(String) }]);
  });
});

describe('findCrosstalk', () => {
  it('finds overlaps of two mapped speakers longer than the minimum', () => {
    const r = findCrosstalk([u(0, 6, 'A'), u(2, 6, 'B')], MAP, 1.5);
    expect(r).toEqual([{ startSec: 2, endSec: 6 }]);
  });
  it('ignores overlaps involving unmapped speakers or short overlaps', () => {
    expect(findCrosstalk([u(0, 6, 'A'), u(2, 6, 'C')], MAP, 1.5)).toEqual([]);
    expect(findCrosstalk([u(0, 3, 'A'), u(2.5, 6, 'B')], MAP, 1.5)).toEqual([]);
  });
});
