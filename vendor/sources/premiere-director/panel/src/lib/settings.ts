import { DEFAULT_SILENCE_CONFIG, type SilenceConfig } from '../silence/detect';
import { DEFAULT_DIRECTOR_CONFIG, type DirectorConfig } from '../director/types';

export interface Settings {
  whisperBinPath: string; whisperModelPath: string;
  diarizeBinPath: string; diarizeSegModelPath: string; diarizeEmbModelPath: string;
  wavPresetPath: string;
  silence: SilenceConfig;
  director: DirectorConfig;
}

const KEY = 'premiere-director.settings';

export function defaultSettings(): Settings {
  return {
    whisperBinPath: '', whisperModelPath: '',
    diarizeBinPath: '', diarizeSegModelPath: '', diarizeEmbModelPath: '',
    wavPresetPath: '',
    silence: { ...DEFAULT_SILENCE_CONFIG },
    director: { ...DEFAULT_DIRECTOR_CONFIG },
  };
}

export interface KV { get(k: string): string | null; set(k: string, v: string): void; }

export const localStorageKV: KV = {
  get: (k) => window.localStorage.getItem(k),
  set: (k, v) => window.localStorage.setItem(k, v),
};

function mergeOverDefaults(parsed: Partial<Settings>): Settings {
  const d = defaultSettings();
  return {
    ...d, ...parsed,
    silence: { ...d.silence, ...(parsed.silence ?? {}) },
    director: { ...d.director, ...(parsed.director ?? {}) },
  };
}

// Parse a settings JSON string over the defaults. Null/empty/corrupt → defaults.
export function parseSettings(text: string | null): Settings {
  if (!text || !text.trim()) return defaultSettings();
  try {
    return mergeOverDefaults(JSON.parse(text) as Partial<Settings>);
  } catch {
    return defaultSettings();
  }
}

export function loadSettings(kv: KV): Settings {
  return parseSettings(kv.get(KEY));
}

export function saveSettings(kv: KV, s: Settings): void {
  kv.set(KEY, JSON.stringify(s));
}

/* ---------- durable file-backed persistence ----------
   localStorage lives in Premiere's CEF cache and is wiped by updates / cache
   clears. Settings persist to a real JSON file instead, in the same dir as the
   ASR model that reliably survives. The file is human-readable and editable. */

export interface SettingsFileIO {
  read(path: string): string | null;   // file contents, or null if absent/unreadable
  write(path: string, data: string): void;
  ensureDir(path: string): void;        // ensure the parent dir of `path` exists
}

export function settingsFilePath(homeDir: string): string {
  return `${homeDir}/.premiere-director/settings.json`;
}

export function saveSettingsFile(path: string, s: Settings, io: SettingsFileIO): void {
  io.ensureDir(path);
  io.write(path, JSON.stringify(s, null, 2) + '\n');
}

// The single entry point the app uses at startup: prefer the JSON file; if it's
// absent, migrate any legacy localStorage value onto disk once; else seed defaults.
export function resolveSettings(path: string, io: SettingsFileIO, kv: KV): Settings {
  const fileText = io.read(path);
  if (fileText && fileText.trim()) return parseSettings(fileText);
  const migrated = loadSettings(kv);
  try { saveSettingsFile(path, migrated, io); } catch { /* best-effort seed */ }
  return migrated;
}
