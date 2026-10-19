export interface TimeRange { startSec: number; endSec: number; }
export interface SilenceConfig { thresholdDb: number; minSilenceMs: number; paddingMs: number; minKeepMs: number; windowMs: number; }

export const DEFAULT_SILENCE_CONFIG: SilenceConfig = {
  thresholdDb: -40, minSilenceMs: 600, paddingMs: 120, minKeepMs: 250, windowMs: 20,
};

export function detectSilence(samples: Float32Array, sampleRate: number, cfg: SilenceConfig): TimeRange[] {
  const win = Math.max(1, Math.round((cfg.windowMs / 1000) * sampleRate));
  const winSec = win / sampleRate;
  const silentWins: boolean[] = [];
  for (let i = 0; i + win <= samples.length; i += win) {
    let sum = 0;
    for (let k = i; k < i + win; k++) sum += samples[k]! * samples[k]!;
    const rms = Math.sqrt(sum / win);
    const db = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
    silentWins.push(db < cfg.thresholdDb);
  }

  const raw: TimeRange[] = [];
  let runStart = -1;
  for (let i = 0; i <= silentWins.length; i++) {
    const s = i < silentWins.length && silentWins[i]!;
    if (s && runStart < 0) runStart = i;
    if (!s && runStart >= 0) {
      raw.push({ startSec: runStart * winSec, endSec: i * winSec });
      runStart = -1;
    }
  }

  const minSil = cfg.minSilenceMs / 1000;
  const pad = cfg.paddingMs / 1000;
  const padded = raw
    .filter((r) => r.endSec - r.startSec >= minSil)
    .map((r) => ({ startSec: r.startSec + pad, endSec: r.endSec - pad }))
    .filter((r) => r.endSec > r.startSec);

  const minKeep = cfg.minKeepMs / 1000;
  const merged: TimeRange[] = [];
  for (const r of padded) {
    const last = merged[merged.length - 1];
    if (last && r.startSec - last.endSec < minKeep) last.endSec = r.endSec;
    else merged.push({ ...r });
  }
  return merged;
}
