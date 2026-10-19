import type { Operation } from '../operations/schema';
import type { SequenceInfo, TrackInfo } from '../operations/model';
import type { TimeRange } from './detect';

const EPS = 0.001;

export function quantizeToFrame(t: number, fps: number): number {
  return fps > 0 ? Math.round(t * fps) / fps : t;
}

export function razorTimesForRanges(ranges: TimeRange[], fps: number): number[] {
  const set = new Set<number>();
  for (const r of ranges) {
    set.add(quantizeToFrame(r.startSec, fps));
    set.add(quantizeToFrame(r.endSec, fps));
  }
  return [...set].sort((a, b) => a - b);
}

export function compileRazorOps(times: number[]): Operation[] {
  return times.map((t) => ({ type: 'razorAll', timeSec: t }));
}

function primaryTrack(seq: SequenceInfo): { trackType: 'video' | 'audio'; track: TrackInfo } | null {
  const v = seq.videoTracks.find((t) => t.clips.length > 0);
  if (v) return { trackType: 'video', track: v };
  const a = seq.audioTracks.find((t) => t.clips.length > 0);
  return a ? { trackType: 'audio', track: a } : null;
}

export function selectDeleteOps(seq: SequenceInfo, ranges: TimeRange[], fps: number): Operation[] {
  const primary = primaryTrack(seq);
  if (!primary) return [];
  const quantized = ranges.map((r) => ({
    startSec: quantizeToFrame(r.startSec, fps),
    endSec: quantizeToFrame(r.endSec, fps),
  }));
  const inside = primary.track.clips.filter((c) =>
    quantized.some((r) => c.startSec >= r.startSec - EPS && c.endSec <= r.endSec + EPS)
  );
  return inside
    .sort((a, b) => b.startSec - a.startSec)
    .map((c) => ({
      type: 'rippleDelete' as const,
      trackType: primary.trackType,
      trackIndex: primary.track.index,
      clipIndex: c.index,
    }));
}
