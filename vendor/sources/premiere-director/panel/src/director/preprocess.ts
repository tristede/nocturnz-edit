import type { Utterance } from './types';

export function mergeUtterances(utts: Utterance[], gapBridgeSec: number): Utterance[] {
  const sorted = [...utts].sort((a, b) => a.startSec - b.startSec);
  const out: Utterance[] = [];
  for (const cur of sorted) {
    const last = out[out.length - 1];
    if (last && last.speakerId === cur.speakerId && cur.startSec - last.endSec < gapBridgeSec) {
      last.endSec = Math.max(last.endSec, cur.endSec);
      last.text = `${last.text} ${cur.text}`.trim();
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}
