import { describe, expect, it } from 'vitest';
import { assignSpeakers, diarize, parseDiarizationOutput, utterancesFromDiarization } from './diarize';

describe('parseDiarizationOutput', () => {
  it('parses segment lines and ignores noise lines', () => {
    const out = parseDiarizationOutput('loading model...\n0.031 -- 5.290 speaker_00\n5.400 -- 9.000 speaker_01\ndone\n');
    expect(out).toEqual([
      { startSec: 0.031, endSec: 5.29, speakerId: 'speaker_00' },
      { startSec: 5.4, endSec: 9, speakerId: 'speaker_01' },
    ]);
  });
});

describe('assignSpeakers', () => {
  const segs = [
    { startSec: 0, endSec: 5, speakerId: 'speaker_00' },
    { startSec: 5, endSec: 10, speakerId: 'speaker_01' },
  ];
  it('assigns by maximum overlap', () => {
    const utts = assignSpeakers([{ startSec: 4, endSec: 8, speakerId: 'speaker_?', text: 'hi' }], segs);
    expect(utts[0]!.speakerId).toBe('speaker_01'); // 3s overlap vs 1s
  });
  it('keeps speaker_? when nothing overlaps', () => {
    const utts = assignSpeakers([{ startSec: 20, endSec: 21, speakerId: 'speaker_?', text: 'hi' }], segs);
    expect(utts[0]!.speakerId).toBe('speaker_?');
  });
});

describe('utterancesFromDiarization', () => {
  const w = (startSec: number, endSec: number, text: string) => ({ startSec, endSec, speakerId: 'speaker_?', text });

  it('preserves a speaker turn that happens inside one whisper segment', () => {
    // One 10s whisper segment; diarization hears A for 6s then B for 4s.
    const whisper = [w(0, 10, 'long shared sentence')];
    const segs = [
      { startSec: 0, endSec: 6, speakerId: 'speaker_00' },
      { startSec: 6, endSec: 10, speakerId: 'speaker_01' },
    ];
    const utts = utterancesFromDiarization(segs, whisper);
    expect(utts).toHaveLength(2);
    expect(utts[0]).toMatchObject({ startSec: 0, endSec: 6, speakerId: 'speaker_00' });
    expect(utts[1]).toMatchObject({ startSec: 6, endSec: 10, speakerId: 'speaker_01' });
  });

  it('attaches text from whisper segments whose midpoint falls in the turn', () => {
    const whisper = [w(0, 4, 'hello there'), w(4, 8, 'general kenobi')];
    const segs = [
      { startSec: 0, endSec: 4.5, speakerId: 'speaker_00' },
      { startSec: 4.5, endSec: 8, speakerId: 'speaker_01' },
    ];
    const utts = utterancesFromDiarization(segs, whisper);
    expect(utts[0]!.text).toBe('hello there');
    expect(utts[1]!.text).toBe('general kenobi'); // midpoint 6 in [4.5, 8)
  });

  it('falls back to any-overlap text when no midpoint lands inside a short turn', () => {
    const whisper = [w(0, 10, 'one big segment')];
    const segs = [{ startSec: 7, endSec: 9, speakerId: 'speaker_01' }];
    expect(utterancesFromDiarization(segs, whisper)[0]!.text).toBe('one big segment');
  });
});

describe('diarize', () => {
  const cfg = { binPath: '/d', segModelPath: '/seg.onnx', embModelPath: '/emb.onnx' };
  const output = '0.0 -- 3.0 speaker_00\n';

  it('uses the sherpa-onnx dotted flag names', async () => {
    let seen: string[] = [];
    await diarize('/a.wav', cfg, async (_bin, args) => { seen = args; return { exitCode: 0, stdout: output, stderr: '' }; });
    expect(seen).toEqual([
      '--segmentation.pyannote-model=/seg.onnx',
      '--embedding.model=/emb.onnx',
      '/a.wav',
    ]);
  });

  it('passes num-clusters when numSpeakers is set, omits it otherwise', async () => {
    let seen: string[] = [];
    await diarize('/a.wav', { ...cfg, numSpeakers: 2 }, async (_bin, args) => { seen = args; return { exitCode: 0, stdout: output, stderr: '' }; });
    expect(seen).toContain('--clustering.num-clusters=2');
    await diarize('/a.wav', cfg, async (_bin, args) => { seen = args; return { exitCode: 0, stdout: output, stderr: '' }; });
    expect(seen.some((a) => a.startsWith('--clustering.num-clusters'))).toBe(false);
  });
});
