import { describe, expect, it } from 'vitest';
import { parseWav } from './wav';

function makeWav(
  samples: number[],
  sampleRate = 16000,
  channels = 1,
  options?: { audioFormat?: number; bits?: number; truncate?: boolean }
): ArrayBuffer {
  const audioFormat = options?.audioFormat ?? 1;
  const bits = options?.bits ?? 16;
  const dataLen = channels === 1 ? samples.length * 2 : samples.length * 2;
  let buf = new ArrayBuffer(44 + dataLen);
  const v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + dataLen, true); w(8, 'WAVE');
  w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, audioFormat, true); v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * channels * 2, true);
  v.setUint16(32, channels * 2, true); v.setUint16(34, bits, true);
  w(36, 'data'); v.setUint32(40, dataLen, true);
  samples.forEach((s, i) => v.setInt16(44 + i * 2, Math.round(s * 32767), true));

  if (options?.truncate) {
    buf = buf.slice(0, 44 + Math.floor(dataLen / 2));
  }
  return buf;
}

describe('parseWav', () => {
  it('parses 16-bit mono PCM', () => {
    const { sampleRate, samples } = parseWav(makeWav([0, 0.5, -0.5, 1]));
    expect(sampleRate).toBe(16000);
    expect(samples.length).toBe(4);
    expect(samples[1]).toBeCloseTo(0.5, 2);
    expect(samples[2]).toBeCloseTo(-0.5, 2);
  });
  it('throws on non-RIFF input', () => {
    expect(() => parseWav(new ArrayBuffer(10))).toThrow(/not a wav/i);
  });
  it('throws on truncated data chunk', () => {
    expect(() => parseWav(makeWav([0, 0.5, -0.5, 1], 16000, 1, { truncate: true }))).toThrow(/truncated/i);
  });
  it('downmixes stereo to channel 0', () => {
    // Create stereo WAV: ch0=[0.5, -0.5], ch1=[0.1, -0.1], interleaved
    const buf = new ArrayBuffer(44 + 8);
    const v = new DataView(buf);
    const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 44, true); w(8, 'WAVE');
    w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
    v.setUint32(24, 16000, true); v.setUint32(28, 16000 * 2 * 2, true);
    v.setUint16(32, 4, true); v.setUint16(34, 16, true);
    w(36, 'data'); v.setUint32(40, 8, true);
    // Interleaved: ch0_frame0, ch1_frame0, ch0_frame1, ch1_frame1
    v.setInt16(44, Math.round(0.5 * 32767), true);   // ch0 frame 0
    v.setInt16(46, Math.round(0.1 * 32767), true);   // ch1 frame 0
    v.setInt16(48, Math.round(-0.5 * 32767), true);  // ch0 frame 1
    v.setInt16(50, Math.round(-0.1 * 32767), true);  // ch1 frame 1
    const { samples } = parseWav(buf);
    expect(samples.length).toBe(2);
    expect(samples[0]).toBeCloseTo(0.5, 2);
    expect(samples[1]).toBeCloseTo(-0.5, 2);
  });
  it('throws on non-PCM format', () => {
    expect(() => parseWav(makeWav([0, 0.5], 16000, 1, { audioFormat: 3 }))).toThrow(/unsupported wav format/i);
  });
  it('throws on unsupported bit depth 8', () => {
    expect(() => parseWav(makeWav([0, 0.5], 16000, 1, { bits: 8 }))).toThrow(/bit depth/i);
  });
  it('throws on invalid channel count', () => {
    const buf = new ArrayBuffer(44 + 4);
    const v = new DataView(buf);
    const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 44, true); w(8, 'WAVE');
    w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 0, true);
    v.setUint32(24, 16000, true); v.setUint32(28, 0, true);
    v.setUint16(32, 0, true); v.setUint16(34, 16, true);
    w(36, 'data'); v.setUint32(40, 4, true);
    expect(() => parseWav(buf)).toThrow(/invalid channel/i);
  });
});
