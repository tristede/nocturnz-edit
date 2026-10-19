import type { SequenceInfo } from '../operations/model';
import type { Utterance } from './types';

export interface SpeakerSummary { speakerId: string; totalSec: number; quotes: string[]; }

export function speakerSummaries(utts: Utterance[], quotesPerSpeaker = 2): SpeakerSummary[] {
  const bySpeaker = new Map<string, Utterance[]>();
  for (const u of utts) {
    const list = bySpeaker.get(u.speakerId) ?? [];
    list.push(u);
    bySpeaker.set(u.speakerId, list);
  }
  return [...bySpeaker.entries()]
    .map(([speakerId, list]) => ({
      speakerId,
      totalSec: list.reduce((s, u) => s + (u.endSec - u.startSec), 0),
      quotes: [...list]
        .sort((a, b) => (b.endSec - b.startSec) - (a.endSec - a.startSec))
        .slice(0, quotesPerSpeaker)
        .map((u) => u.text)
        .filter(Boolean),
    }))
    .sort((a, b) => b.totalSec - a.totalSec);
}

export function longestUtterance(utts: Utterance[], speakerId: string): Utterance | null {
  let best: Utterance | null = null;
  for (const u of utts) {
    if (u.speakerId !== speakerId) continue;
    if (!best || u.endSec - u.startSec > best.endSec - best.startSec) best = u;
  }
  return best;
}

// Pair each audio track with the video track sharing the most clip-name overlap —
// cameras that recorded their own scratch audio import with identical media names.
export function matchAudioToVideoTracks(seq: SequenceInfo): Array<{ audioIndex: number; videoIndex: number }> {
  const out: Array<{ audioIndex: number; videoIndex: number }> = [];
  for (const a of seq.audioTracks) {
    if (!a.clips.length) continue;
    const aNames = new Set(a.clips.map((c) => c.name).filter(Boolean));
    let best: { videoIndex: number; shared: number } | null = null;
    for (const v of seq.videoTracks) {
      const shared = v.clips.filter((c) => aNames.has(c.name)).length;
      if (shared > 0 && (!best || shared > best.shared)) best = { videoIndex: v.index, shared };
    }
    if (best) out.push({ audioIndex: a.index, videoIndex: best.videoIndex });
  }
  return out;
}

// Mean squared amplitude of `samples` restricted to the given speaker's turns.
export function speakerEnergy(samples: Float32Array, sampleRate: number, utts: Utterance[], speakerId: string): number {
  let sum = 0;
  let count = 0;
  for (const u of utts) {
    if (u.speakerId !== speakerId) continue;
    const from = Math.max(0, Math.floor(u.startSec * sampleRate));
    const to = Math.min(samples.length, Math.ceil(u.endSec * sampleRate));
    for (let i = from; i < to; i++) { sum += samples[i]! * samples[i]!; count++; }
  }
  return count ? sum / count : 0;
}

export interface EnergyAssignment { assignments: Record<string, number>; confidence: Record<string, number>; }

// energy[cameraIdx][speakerIdx] → best one-to-one speaker→camera assignment.
// Shares are normalized per camera (removes per-mic gain differences), then the
// permutation maximizing total share wins; confidence is each speaker's share of
// its column across cameras.
export function assignByEnergy(
  energy: number[][], speakerIds: string[], cameraVideoIndices: number[],
): EnergyAssignment {
  const nCams = energy.length;
  const nSpk = speakerIds.length;
  const share = energy.map((row) => {
    const total = row.reduce((s, v) => s + v, 0) || 1;
    return row.map((v) => v / total);
  });

  // All injective speaker→camera assignments (nSpk and nCams are tiny).
  let best: number[] | null = null;
  let bestScore = -Infinity;
  const walk = (spk: number, used: boolean[], picks: number[], score: number): void => {
    if (spk === nSpk) {
      if (score > bestScore) { bestScore = score; best = [...picks]; }
      return;
    }
    for (let cam = 0; cam < nCams; cam++) {
      if (used[cam] && nCams >= nSpk) continue; // reuse cameras only if there are fewer cameras than speakers
      used[cam] = true;
      picks.push(cam);
      walk(spk + 1, used, picks, score + share[cam]![spk]!);
      picks.pop();
      used[cam] = false;
    }
  };
  walk(0, new Array(nCams).fill(false), [], 0);

  const assignments: Record<string, number> = {};
  const confidence: Record<string, number> = {};
  (best ?? []).forEach((cam, spk) => {
    assignments[speakerIds[spk]!] = cameraVideoIndices[cam]!;
    const colTotal = share.reduce((s, row) => s + row[spk]!, 0) || 1;
    confidence[speakerIds[spk]!] = share[cam]![spk]! / colTotal;
  });
  return { assignments, confidence };
}
