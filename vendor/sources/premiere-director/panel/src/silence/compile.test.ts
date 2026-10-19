import { describe, expect, it } from 'vitest';
import type { SequenceInfo } from '../operations/model';
import { compileRazorOps, quantizeToFrame, razorTimesForRanges, selectDeleteOps } from './compile';

function seqWithClips(clips: Array<[number, number]>): SequenceInfo {
  return {
    name: 'test', endSec: 100, fps: 30,
    videoTracks: [{
      index: 0, name: 'V1',
      clips: clips.map(([s, e], i) => ({ index: i, nodeId: `n${i}`, name: `c${i}`, startSec: s, endSec: e, enabled: true })),
    }],
    audioTracks: [],
  };
}

describe('silence compile', () => {
  it('razors both boundaries of each range, deduped and sorted', () => {
    const times = razorTimesForRanges([{ startSec: 2, endSec: 4 }, { startSec: 4, endSec: 6 }], 30);
    expect(times).toEqual([2, 4, 6]);
    expect(compileRazorOps(times)).toEqual([
      { type: 'razorAll', timeSec: 2 }, { type: 'razorAll', timeSec: 4 }, { type: 'razorAll', timeSec: 6 },
    ]);
  });
  it('selects only clips fully inside ranges, descending order', () => {
    // post-razor timeline: [0-2][2-4][4-6][6-8]; silence ranges 2-4 and 6-8
    const seq = seqWithClips([[0, 2], [2, 4], [4, 6], [6, 8]]);
    const ops = selectDeleteOps(seq, [{ startSec: 2, endSec: 4 }, { startSec: 6, endSec: 8 }], 30);
    expect(ops).toEqual([
      { type: 'rippleDelete', trackType: 'video', trackIndex: 0, clipIndex: 3 },
      { type: 'rippleDelete', trackType: 'video', trackIndex: 0, clipIndex: 1 },
    ]);
  });
  it('does not select clips that only partially overlap a range', () => {
    const seq = seqWithClips([[0, 3], [3, 8]]);
    expect(selectDeleteOps(seq, [{ startSec: 2, endSec: 4 }], 30)).toEqual([]);
  });

  describe('frame quantization at non-integer fps', () => {
    const FPS = 29.97;

    it('quantizes a boundary to the nearest frame time', () => {
      const expected = Math.round(1.003 * FPS) / FPS;
      expect(quantizeToFrame(1.003, FPS)).toBeCloseTo(expected, 10);
      const times = razorTimesForRanges([{ startSec: 1.003, endSec: 5 }], FPS);
      expect(times[0]).toBeCloseTo(expected, 10);
    });

    it('selects a post-razor clip whose boundaries sit exactly on quantized frame times, even when detection range bounds were up to half a frame off', () => {
      const frame = 1 / FPS;
      const rawStart = 2 + frame * 0.4; // within half a frame of the 2s boundary
      const rawEnd = 4 - frame * 0.4; // within half a frame of the 4s boundary
      const quantStart = quantizeToFrame(rawStart, FPS);
      const quantEnd = quantizeToFrame(rawEnd, FPS);
      // Clip sits exactly on the quantized frame boundaries (as the host would produce post-razor).
      const seq = seqWithClips([[0, quantStart], [quantStart, quantEnd], [quantEnd, 8]]);
      const ops = selectDeleteOps(seq, [{ startSec: rawStart, endSec: rawEnd }], FPS);
      expect(ops).toEqual([{ type: 'rippleDelete', trackType: 'video', trackIndex: 0, clipIndex: 1 }]);
    });

    it('collapses two boundaries within one frame into a single razor time', () => {
      const frame = 1 / FPS;
      const times = razorTimesForRanges(
        [{ startSec: 2, endSec: 4 }, { startSec: 4 + frame * 0.2, endSec: 6 }],
        FPS,
      );
      // The 4s and 4+0.2*frame boundaries land on the same quantized frame and collapse to one entry.
      expect(times).toHaveLength(3);
      expect(times[1]).toBeCloseTo(quantizeToFrame(4, FPS), 10);
    });
  });
});
