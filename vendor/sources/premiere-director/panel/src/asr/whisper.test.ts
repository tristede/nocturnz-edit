import { describe, expect, it } from 'vitest';
import { parseWhisperJson, transcribe } from './whisper';

const WHISPER_JSON = JSON.stringify({
  transcription: [
    { offsets: { from: 0, to: 2500 }, text: ' Hello there.' },
    { offsets: { from: 2600, to: 4000 }, text: ' General Kenobi.' },
  ],
});

describe('parseWhisperJson', () => {
  it('maps offsets (ms) to seconds and trims text', () => {
    const utts = parseWhisperJson(WHISPER_JSON);
    expect(utts).toEqual([
      { startSec: 0, endSec: 2.5, speakerId: 'speaker_?', text: 'Hello there.' },
      { startSec: 2.6, endSec: 4, speakerId: 'speaker_?', text: 'General Kenobi.' },
    ]);
  });
  it('throws a readable error on malformed output', () => {
    expect(() => parseWhisperJson('{}')).toThrow(/transcription/i);
  });
});

describe('transcribe', () => {
  it('invokes whisper with -oj and reads the JSON output file', async () => {
    let seen: { bin: string; args: string[] } | null = null;
    const utts = await transcribe('/tmp/a.wav', { binPath: '/bin/whisper-cli', modelPath: '/m.bin' }, {
      run: async (bin, args) => { seen = { bin, args }; return { exitCode: 0, stdout: '', stderr: '' }; },
      readFile: async () => WHISPER_JSON,
      tmpDir: '/tmp',
    });
    expect(utts).toHaveLength(2);
    expect(seen!.args).toContain('-oj');
    expect(seen!.args).toContain('/tmp/a.wav');
  });
  it('fails with stderr context when whisper exits nonzero', async () => {
    await expect(transcribe('/tmp/a.wav', { binPath: 'w', modelPath: 'm' }, {
      run: async () => ({ exitCode: 1, stdout: '', stderr: 'model load failed' }),
      readFile: async () => '', tmpDir: '/tmp',
    })).rejects.toThrow(/model load failed/);
  });
});
