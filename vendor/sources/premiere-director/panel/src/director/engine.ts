import type { TimeRange } from '../silence/detect';
import type { CameraMap, DirectorConfig, SwitchPoint, Utterance } from './types';

export function findCrosstalk(utts: Utterance[], map: CameraMap, minOverlapSec: number): TimeRange[] {
  const mapped = utts.filter((u) => map.speakerToTrack[u.speakerId] != null);
  const out: TimeRange[] = [];
  for (let i = 0; i < mapped.length; i++) {
    for (let j = i + 1; j < mapped.length; j++) {
      const a = mapped[i]!, b = mapped[j]!;
      if (a.speakerId === b.speakerId) continue;
      const s = Math.max(a.startSec, b.startSec);
      const e = Math.min(a.endSec, b.endSec);
      if (e - s >= minOverlapSec) out.push({ startSec: s, endSec: e });
    }
  }
  // merge overlapping crosstalk windows
  out.sort((x, y) => x.startSec - y.startSec);
  const merged: TimeRange[] = [];
  for (const r of out) {
    const last = merged[merged.length - 1];
    if (last && r.startSec <= last.endSec) last.endSec = Math.max(last.endSec, r.endSec);
    else merged.push({ ...r });
  }
  return merged;
}

type PlanEvent =
  | { kind: 'crosstalk'; timeSec: number; window: TimeRange }
  | { kind: 'utterance'; timeSec: number; utt: Utterance; track: number }
  | { kind: 'resume'; timeSec: number; utt: Utterance; track: number };

export function planSwitches(
  utts: Utterance[], map: CameraMap, cfg: DirectorConfig, initialTrackIndex: number,
): SwitchPoint[] {
  const sorted = [...utts].sort((a, b) => a.startSec - b.startSec);
  const crosstalk = map.wideTrackIndex != null ? findCrosstalk(sorted, map, cfg.crosstalkMinSec) : [];
  const crosstalkWindowAt = (t: number) => crosstalk.find((r) => t >= r.startSec && t < r.endSec);

  // Single time-ordered walk: crosstalk-window starts and qualifying utterances,
  // merged and processed in ascending time order (crosstalk first on ties) so
  // that neither pass can undo or poison the other's decisions.
  const events: PlanEvent[] = [];
  for (const r of crosstalk) {
    events.push({ kind: 'crosstalk', timeSec: r.startSec, window: r });
  }
  for (const u of sorted) {
    const track = map.speakerToTrack[u.speakerId] ?? null;
    if (track == null) continue; // off-camera hold
    if (u.endSec - u.startSec < cfg.speakThresholdSec) continue; // brief remark / weak interrupt
    events.push({ kind: 'utterance', timeSec: u.startSec, utt: u, track });
    // If a crosstalk window ends strictly inside this utterance, the speaker was
    // already mid-utterance when the window opened and keeps talking solo after
    // it closes — enqueue a resume candidate so they get re-evaluated for a
    // switchback instead of being stranded on the wide shot for the rest of it.
    for (const r of crosstalk) {
      if (r.endSec > u.startSec && r.endSec < u.endSec) {
        events.push({ kind: 'resume', timeSec: r.endSec, utt: u, track });
      }
    }
  }
  events.sort((a, b) => {
    if (a.timeSec !== b.timeSec) return a.timeSec - b.timeSec;
    const aCrosstalk = a.kind === 'crosstalk';
    const bCrosstalk = b.kind === 'crosstalk';
    if (aCrosstalk !== bCrosstalk) return aCrosstalk ? -1 : 1;
    return 0;
  });

  const switches: SwitchPoint[] = [];
  let current = initialTrackIndex;
  let lastSwitch = -Infinity;

  for (const ev of events) {
    if (ev.kind === 'crosstalk') {
      const track = map.wideTrackIndex!;
      if (track === current) continue;
      const t = Math.max(ev.window.startSec, lastSwitch + cfg.minShotSec);
      if (t >= ev.window.endSec) continue; // couldn't legally cut before crosstalk ended
      switches.push({ timeSec: t, toTrackIndex: track, reason: 'crosstalk → wide shot' });
      current = track;
      lastSwitch = t;
    } else {
      const { utt: u, track } = ev;
      if (track === current) continue;
      let t = Math.max(ev.timeSec, lastSwitch + cfg.minShotSec);
      const win = map.wideTrackIndex != null ? crosstalkWindowAt(t) : undefined;
      if (win) {
        // wide shot owns this moment; defer the individual cut until crosstalk ends.
        // The window match (t >= win.startSec && t < win.endSec) combined with
        // t >= lastSwitch + minShotSec (from the Math.max above) guarantees
        // lastSwitch + minShotSec < win.endSec, so the spacing floor can never
        // exceed win.endSec here — no need to re-apply Math.max(..., lastSwitch + minShotSec).
        t = win.endSec;
      }
      if (t >= u.endSec) continue; // couldn't legally cut before the moment passed
      const reason = ev.kind === 'resume'
        ? `${u.speakerId} resumes solo, ${(u.endSec - u.startSec).toFixed(1)}s utterance`
        : `${u.speakerId} speaks ${(u.endSec - u.startSec).toFixed(1)}s`;
      switches.push({ timeSec: t, toTrackIndex: track, reason });
      current = track;
      lastSwitch = t;
    }
  }

  return switches.sort((a, b) => a.timeSec - b.timeSec);
}
