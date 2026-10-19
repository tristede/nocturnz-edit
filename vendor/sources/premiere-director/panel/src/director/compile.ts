import type { Operation } from '../operations/schema';
import type { SequenceInfo } from '../operations/model';
import type { SwitchPoint } from './types';

export interface Segment { startSec: number; endSec: number; activeTrackIndex: number; }

export function switchesToSegments(
  switches: SwitchPoint[], startSec: number, endSec: number, initialTrackIndex: number,
): Segment[] {
  const sorted = [...switches].sort((a, b) => a.timeSec - b.timeSec);
  const segs: Segment[] = [];
  let cursor = startSec;
  let active = initialTrackIndex;
  for (const sw of sorted) {
    if (sw.timeSec > cursor) segs.push({ startSec: cursor, endSec: sw.timeSec, activeTrackIndex: active });
    cursor = sw.timeSec;
    active = sw.toTrackIndex;
  }
  if (cursor < endSec) segs.push({ startSec: cursor, endSec, activeTrackIndex: active });
  return segs;
}

export function compileEnableOps(
  seq: SequenceInfo, segments: Segment[], cameraTrackIndices: number[],
): Operation[] {
  const ops: Operation[] = [];
  for (const track of seq.videoTracks) {
    if (!cameraTrackIndices.includes(track.index)) continue;
    for (const clip of track.clips) {
      const mid = (clip.startSec + clip.endSec) / 2;
      const seg = segments.find((s) => mid >= s.startSec && mid < s.endSec);
      if (!seg) continue;
      const shouldEnable = seg.activeTrackIndex === track.index;
      if (clip.enabled !== shouldEnable) {
        ops.push({ type: 'setClipEnabled', trackType: 'video', trackIndex: track.index, clipIndex: clip.index, enabled: shouldEnable });
      }
    }
  }
  return ops;
}
