export function parseWav(buf: ArrayBuffer): { sampleRate: number; samples: Float32Array } {
  const v = new DataView(buf);
  const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (buf.byteLength < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('not a WAV file');

  let off = 12;
  let fmt: { channels: number; sampleRate: number; bits: number } | null = null;
  let data: { start: number; len: number } | null = null;
  while (off + 8 <= buf.byteLength) {
    const id = tag(off);
    const size = v.getUint32(off + 4, true);
    if (id === 'fmt ') {
      const audioFormat = v.getUint16(off + 8, true);
      if (audioFormat !== 1) throw new Error(`unsupported WAV format ${audioFormat} (need PCM)`);
      fmt = { channels: v.getUint16(off + 10, true), sampleRate: v.getUint32(off + 12, true), bits: v.getUint16(off + 22, true) };
    } else if (id === 'data') {
      data = { start: off + 8, len: size };
    }
    off += 8 + size + (size % 2);
  }
  if (!fmt || !data) throw new Error('WAV missing fmt/data chunk');
  if (fmt.channels < 1) throw new Error('WAV has invalid channel count');
  if (fmt.bits !== 16) throw new Error(`unsupported bit depth ${fmt.bits} (need 16)`);
  if (data.start + data.len > buf.byteLength) throw new Error('WAV data chunk truncated');

  const frameCount = Math.floor(data.len / (2 * fmt.channels));
  const samples = new Float32Array(frameCount);
  for (let i = 0; i < frameCount; i++) {
    samples[i] = v.getInt16(data.start + i * 2 * fmt.channels, true) / 32768;
  }
  return { sampleRate: fmt.sampleRate, samples };
}
