import { describe, expect, it } from 'vitest';
import type { SequenceInfo } from '../operations/model';
import { compileEnableOps, switchesToSegments } from './compile';

function seq(tracks: Array<{ index: number; clips: Array<[number, number, boolean]> }>): SequenceInfo {
  return {
    name: 's', endSec: 10, fps: 30, audioTracks: [],
    videoTracks: tracks.map((t) => ({
      index: t.index, name: `V${t.index + 1}`,
      clips: t.clips.map(([s, e, en], i) => ({ index: i, nodeId: `t${t.index}c${i}`, name: '', startSec: s, endSec: e, enabled: en })),
    })),
  };
}

describe('switchesToSegments', () => {
  it('builds contiguous segments from switches', () => {
    const segs = switchesToSegments(
      [{ timeSec: 3, toTrackIndex: 1, reason: '' }, { timeSec: 7, toTrackIndex: 0, reason: '' }], 0, 10, 0);
    expect(segs).toEqual([
      { startSec: 0, endSec: 3, activeTrackIndex: 0 },
      { startSec: 3, endSec: 7, activeTrackIndex: 1 },
      { startSec: 7, endSec: 10, activeTrackIndex: 0 },
    ]);
  });
});

describe('compileEnableOps', () => {
  it('enables only the active camera per segment, emitting only changes', () => {
    // both tracks razored at 3; all clips currently enabled
    const s = seq([
      { index: 0, clips: [[0, 3, true], [3, 10, true]] },
      { index: 1, clips: [[0, 3, true], [3, 10, true]] },
    ]);
    const ops = compileEnableOps(s, [
      { startSec: 0, endSec: 3, activeTrackIndex: 0 },
      { startSec: 3, endSec: 10, activeTrackIndex: 1 },
    ], [0, 1]);
    expect(ops).toEqual([
      { type: 'setClipEnabled', trackType: 'video', trackIndex: 0, clipIndex: 1, enabled: false },
      { type: 'setClipEnabled', trackType: 'video', trackIndex: 1, clipIndex: 0, enabled: false },
    ]);
  });
  it('ignores tracks not in cameraTrackIndices', () => {
    const s = seq([{ index: 0, clips: [[0, 10, true]] }, { index: 2, clips: [[0, 10, true]] }]);
    const ops = compileEnableOps(s, [{ startSec: 0, endSec: 10, activeTrackIndex: 0 }], [0]);
    expect(ops).toEqual([]);
  });
});
