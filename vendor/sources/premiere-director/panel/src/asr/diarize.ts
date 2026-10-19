import type { Utterance } from '../director/types';
import type { Runner } from './run';

export interface DiarSegment { startSec: number; endSec: number; speakerId: string; }

const LINE = /^(\d+(?:\.\d+)?)\s*--\s*(\d+(?:\.\d+)?)\s+(\S+)\s*$/;

export function parseDiarizationOutput(text: string): DiarSegment[] {
  const out: DiarSegment[] = [];
  for (const line of text.split('\n')) {
    const m = LINE.exec(line.trim());
    if (m) out.push({ startSec: Number(m[1]), endSec: Number(m[2]), speakerId: m[3]! });
  }
  return out;
}

export function assignSpeakers(utts: Utterance[], segs: DiarSegment[]): Utterance[] {
  return utts.map((u) => {
    const overlapBySpeaker = new Map<string, number>();
    for (const s of segs) {
      const ov = Math.min(u.endSec, s.endSec) - Math.max(u.startSec, s.startSec);
      if (ov > 0) overlapBySpeaker.set(s.speakerId, (overlapBySpeaker.get(s.speakerId) ?? 0) + ov);
    }
    let best: string | null = null;
    let bestOv = 0;
    for (const [spk, ov] of overlapBySpeaker) if (ov > bestOv) { best = spk; bestOv = ov; }
    return best ? { ...u, speakerId: best } : u;
  });
}

// Build engine utterances from diarization turns, attaching transcript text by
// time overlap. Diarization boundaries are the timeline truth: whisper segments
// span speaker turns (they break on sentences, not voices), so labeling whole
// whisper segments with a majority speaker erases every turn shorter than the
// segment and the director never sees the change.
export function utterancesFromDiarization(segs: DiarSegment[], transcript: Utterance[]): Utterance[] {
  return segs.map((s) => {
    const byMidpoint = transcript.filter((w) => {
      const mid = (w.startSec + w.endSec) / 2;
      return mid >= s.startSec && mid < s.endSec;
    });
    const source = byMidpoint.length
      ? byMidpoint
      : transcript.filter((w) => Math.min(w.endSec, s.endSec) - Math.max(w.startSec, s.startSec) > 0);
    return {
      startSec: s.startSec,
      endSec: s.endSec,
      speakerId: s.speakerId,
      text: source.map((w) => w.text).join(' ').trim(),
    };
  });
}

export async function diarize(
  wavPath: string,
  cfg: { binPath: string; segModelPath: string; embModelPath: string; numSpeakers?: number },
  run: Runner,
): Promise<DiarSegment[]> {
  const args = [
    `--segmentation.pyannote-model=${cfg.segModelPath}`,
    `--embedding.model=${cfg.embModelPath}`,
  ];
  // Without a known speaker count the default cluster threshold over-splits
  // real conversations into many phantom speakers.
  if (cfg.numSpeakers && cfg.numSpeakers > 0) args.push(`--clustering.num-clusters=${cfg.numSpeakers}`);
  args.push(wavPath);
  const res = await run(cfg.binPath, args);
  if (res.exitCode !== 0) throw new Error(`diarization failed (${res.exitCode}): ${res.stderr.slice(-500)}`);
  const segs = parseDiarizationOutput(res.stdout || res.stderr);
  if (!segs.length) throw new Error('diarization produced no segments — check binary and model paths in Settings');
  return segs;
}
