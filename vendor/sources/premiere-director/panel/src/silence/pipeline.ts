import { sequenceHash, type ApplyResult, type HostAdapter } from '../adapters/HostAdapter';
import type { SequenceInfo } from '../operations/model';
import type { Settings } from '../lib/settings';
import { parseWav } from './wav';
import { detectSilence, type TimeRange } from './detect';
import { compileRazorOps, razorTimesForRanges, selectDeleteOps } from './compile';

export interface SilenceAnalysis { ranges: TimeRange[]; seqHash: string; seq: SequenceInfo; totalCutSec: number; }

export async function analyzeSilence(
  host: HostAdapter, settings: Settings,
  deps: { readFileBuf: (p: string) => Promise<ArrayBuffer>; tmpDir: string },
): Promise<SilenceAnalysis> {
  const seq = await host.getSequenceInfo();
  const wavPath = await host.exportAudio(`${deps.tmpDir}/pd-audio-${Date.now()}.wav`, settings.wavPresetPath);
  const { samples, sampleRate } = parseWav(await deps.readFileBuf(wavPath));
  const ranges = detectSilence(samples, sampleRate, settings.silence);
  const totalCutSec = ranges.reduce((s, r) => s + (r.endSec - r.startSec), 0);
  return { ranges, seq, seqHash: sequenceHash(seq), totalCutSec };
}

export async function applySilenceCuts(
  host: HostAdapter, analysis: SilenceAnalysis, keptRanges: TimeRange[],
): Promise<ApplyResult> {
  if (!keptRanges.length) return { ok: true, applied: 0 };
  const razors = compileRazorOps(razorTimesForRanges(keptRanges, analysis.seq.fps));
  const r1 = await host.applyOperations({ ops: razors }, analysis.seqHash);
  if (!r1.ok) return r1;
  const after = await host.getSequenceInfo();
  const deletes = selectDeleteOps(after, keptRanges, after.fps);
  const r2 = await host.applyOperations({ ops: deletes });
  return r2.ok ? { ok: true, applied: r1.applied + r2.applied } : { ...r2, applied: r1.applied + r2.applied };
}
