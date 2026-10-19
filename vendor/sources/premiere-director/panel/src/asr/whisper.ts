import type { Utterance } from '../director/types';
import type { Runner } from './run';

export interface WhisperConfig { binPath: string; modelPath: string; }

interface WhisperSegment { offsets: { from: number; to: number }; text: string; }

export function parseWhisperJson(jsonText: string): Utterance[] {
  const parsed = JSON.parse(jsonText) as { transcription?: WhisperSegment[] };
  if (!Array.isArray(parsed.transcription)) throw new Error('whisper output missing "transcription" array');
  return parsed.transcription.map((s) => ({
    startSec: s.offsets.from / 1000,
    endSec: s.offsets.to / 1000,
    speakerId: 'speaker_?',
    text: s.text.trim(),
  }));
}

export async function transcribe(
  wavPath: string,
  cfg: WhisperConfig,
  deps: { run: Runner; readFile: (p: string) => Promise<string>; tmpDir: string },
): Promise<Utterance[]> {
  const outBase = `${deps.tmpDir}/pd-whisper-${Date.now()}`;
  const args = ['-m', cfg.modelPath, '-f', wavPath, '-oj', '-of', outBase];
  const res = await deps.run(cfg.binPath, args);
  if (res.exitCode !== 0) throw new Error(`whisper failed (${res.exitCode}): ${res.stderr.slice(-500)}`);
  return parseWhisperJson(await deps.readFile(`${outBase}.json`));
}
