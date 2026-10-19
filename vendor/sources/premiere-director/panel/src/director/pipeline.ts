import { sequenceHash, type ApplyResult, type HostAdapter } from '../adapters/HostAdapter';
import type { SequenceInfo } from '../operations/model';
import type { Settings } from '../lib/settings';
import type { Runner } from '../asr/run';
import { transcribe } from '../asr/whisper';
import { diarize, utterancesFromDiarization } from '../asr/diarize';
import { mergeUtterances } from './preprocess';
import { planSwitches } from './engine';
import { compileEnableOps, switchesToSegments } from './compile';
import { compileRazorOps, quantizeToFrame } from '../silence/compile';
import { parseWav } from '../silence/wav';
import { assignByEnergy, matchAudioToVideoTracks, speakerEnergy, type EnergyAssignment } from './speakers';
import type { CameraMap, DirectorConfig, SwitchPoint, Utterance } from './types';
import type { Operation } from '../operations/schema';

export interface PipelineDeps {
  run: Runner;
  readFile: (p: string) => Promise<string>;
  readFileBuf: (p: string) => Promise<ArrayBuffer>;
  tmpDir: string;
}

export interface DirectorAnalysis { utterances: Utterance[]; speakers: string[]; seq: SequenceInfo; seqHash: string; wavPath: string; }

export async function analyzeDialogue(
  host: HostAdapter, settings: Settings, deps: PipelineDeps, numSpeakers?: number,
): Promise<DirectorAnalysis> {
  const seq = await host.getSequenceInfo();
  const wavPath = await host.exportAudio(`${deps.tmpDir}/pd-dialogue-${Date.now()}.wav`, settings.wavPresetPath);
  const raw = await transcribe(wavPath, { binPath: settings.whisperBinPath, modelPath: settings.whisperModelPath }, deps);
  const segs = await diarize(wavPath, {
    binPath: settings.diarizeBinPath, segModelPath: settings.diarizeSegModelPath, embModelPath: settings.diarizeEmbModelPath,
    numSpeakers,
  }, deps.run);
  // Diarization turns are the utterance timeline; whisper only supplies text.
  const labeled = utterancesFromDiarization(segs, raw);
  const merged = mergeUtterances(labeled, settings.director.gapBridgeSec);
  const speakers = [...new Set(merged.map((u) => u.speakerId))];
  return { utterances: merged, speakers, seq, seqHash: sequenceHash(seq), wavPath };
}

// Auto-assign speakers to cameras using each camera's own scratch audio: solo one
// camera mic at a time, export, and measure whose turns that mic favors. Mute
// states are restored even on failure. Requires per-camera audio still in the
// sequence, with clip names matching the camera's video track.
export async function autoAssignCameras(
  host: HostAdapter, analysis: DirectorAnalysis, settings: Settings,
  deps: Pick<PipelineDeps, 'readFileBuf' | 'tmpDir'>,
): Promise<EnergyAssignment> {
  const seq = await host.getSequenceInfo();
  const pairs = matchAudioToVideoTracks(seq);
  if (pairs.length < 2) {
    throw new Error('Auto-assign needs each camera’s own audio on its own track (clip names matching the video track). Assign manually instead.');
  }
  const muteOpsFor = (soloAudioIndex: number | null): Operation[] =>
    seq.audioTracks.map((t) => ({
      type: 'setTrackMute' as const, trackType: 'audio' as const, trackIndex: t.index,
      mute: soloAudioIndex == null ? (t.muted ?? false) : t.index !== soloAudioIndex,
    }));

  const energy: number[][] = [];
  try {
    for (const pair of pairs) {
      const r = await host.applyOperations({ ops: muteOpsFor(pair.audioIndex) });
      if (!r.ok) throw new Error(`could not solo audio track ${pair.audioIndex + 1}: ${r.error ?? 'unknown'}`);
      const wav = await host.exportAudio(`${deps.tmpDir}/pd-cam-${pair.audioIndex}-${Date.now()}.wav`, settings.wavPresetPath);
      const { samples, sampleRate } = parseWav(await deps.readFileBuf(wav));
      energy.push(analysis.speakers.map((s) => speakerEnergy(samples, sampleRate, analysis.utterances, s)));
    }
  } finally {
    await host.applyOperations({ ops: muteOpsFor(null) }); // restore original mute states
  }
  return assignByEnergy(energy, analysis.speakers, pairs.map((p) => p.videoIndex));
}

export function planCameraCuts(analysis: DirectorAnalysis, map: CameraMap, cfg: DirectorConfig, initialTrack: number): SwitchPoint[] {
  return planSwitches(analysis.utterances, map, cfg, initialTrack);
}

function cameraTrackIndices(map: CameraMap): number[] {
  return [
    ...new Set([...Object.values(map.speakerToTrack).filter((t): t is number => t != null),
      ...(map.wideTrackIndex != null ? [map.wideTrackIndex] : [])]),
  ];
}

export async function applyCameraCuts(
  host: HostAdapter, analysis: DirectorAnalysis, switches: SwitchPoint[], map: CameraMap, initialTrack: number,
): Promise<ApplyResult> {
  if (!switches.length) return { ok: true, applied: 0 };
  const razors = compileRazorOps(
    [...new Set(switches.map((s) => quantizeToFrame(s.timeSec, analysis.seq.fps)))].sort((a, b) => a - b),
  );
  const r1 = await host.applyOperations({ ops: razors }, analysis.seqHash);
  if (!r1.ok) return r1;
  const after = await host.getSequenceInfo();
  const segments = switchesToSegments(switches, 0, after.endSec, initialTrack);
  const enables = compileEnableOps(after, segments, cameraTrackIndices(map));
  const r2 = await host.applyOperations({ ops: enables });
  return r2.ok ? { ok: true, applied: r1.applied + r2.applied } : { ...r2, applied: r1.applied + r2.applied };
}

// Recompute which camera is live per segment under a (new) speaker→camera map
// and update ONLY clip enable flags against the timeline's existing cuts. No
// razors, no re-analysis — for fixing a wrong camera assignment after Apply.
// Deliberately unguarded by the analysis hash: the timeline is expected to have
// changed (it was razored); clips are matched by segment midpoint.
export async function applyCameraAssignment(
  host: HostAdapter, analysis: DirectorAnalysis, map: CameraMap, cfg: DirectorConfig, initialTrack: number,
): Promise<ApplyResult> {
  const switches = planSwitches(analysis.utterances, map, cfg, initialTrack);
  const after = await host.getSequenceInfo();
  const segments = switchesToSegments(switches, 0, after.endSec, initialTrack);
  const enables = compileEnableOps(after, segments, cameraTrackIndices(map));
  return host.applyOperations({ ops: enables });
}
