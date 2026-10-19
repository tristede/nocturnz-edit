import { describe, expect, it } from 'vitest';
import {
  defaultSettings, loadSettings, parseSettings, resolveSettings, saveSettings,
  saveSettingsFile, settingsFilePath, type KV, type SettingsFileIO,
} from './settings';

function memKV(): KV & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return { store, get: (k) => store.get(k) ?? null, set: (k, v) => void store.set(k, v) };
}

function memIO(): SettingsFileIO & { files: Map<string, string>; dirs: string[] } {
  const files = new Map<string, string>();
  const dirs: string[] = [];
  return {
    files, dirs,
    read: (p) => files.get(p) ?? null,
    write: (p, d) => void files.set(p, d),
    ensureDir: (p) => void dirs.push(p),
  };
}

describe('settings', () => {
  it('round-trips and merges over defaults', () => {
    const kv = memKV();
    const s = { ...defaultSettings(), whisperBinPath: '/opt/whisper-cli' };
    saveSettings(kv, s);
    expect(loadSettings(kv).whisperBinPath).toBe('/opt/whisper-cli');
    expect(loadSettings(kv).silence.thresholdDb).toBe(-40);
  });
  it('survives corrupt stored JSON', () => {
    const kv = memKV();
    kv.store.set('premiere-director.settings', '{nope');
    expect(loadSettings(kv)).toEqual(defaultSettings());
  });
});

describe('parseSettings', () => {
  it('merges parsed JSON over defaults, deep for sub-configs', () => {
    const s = parseSettings(JSON.stringify({ whisperBinPath: '/w', director: { minShotSec: 2 } }));
    expect(s.whisperBinPath).toBe('/w');
    expect(s.director.minShotSec).toBe(2);
    expect(s.director.speakThresholdSec).toBe(1); // default preserved
    expect(s.silence.thresholdDb).toBe(-40);
  });
  it('returns defaults for null, empty, or corrupt input', () => {
    expect(parseSettings(null)).toEqual(defaultSettings());
    expect(parseSettings('')).toEqual(defaultSettings());
    expect(parseSettings('{nope')).toEqual(defaultSettings());
  });
});

describe('settingsFilePath', () => {
  it('is <home>/.premiere-director/settings.json', () => {
    expect(settingsFilePath('/Users/x')).toBe('/Users/x/.premiere-director/settings.json');
  });
});

describe('file-backed settings', () => {
  const path = '/Users/x/.premiere-director/settings.json';

  it('saveSettingsFile ensures the dir and writes pretty, round-trippable JSON', () => {
    const io = memIO();
    const s = { ...defaultSettings(), diarizeBinPath: '/d' };
    saveSettingsFile(path, s, io);
    expect(io.dirs).toContain(path);
    const written = io.files.get(path)!;
    expect(written).toContain('\n  '); // indented / human-readable
    expect(parseSettings(written)).toEqual(s); // round-trips
  });

  it('resolveSettings reads the file when present (file wins)', () => {
    const io = memIO();
    io.files.set(path, JSON.stringify({ ...defaultSettings(), whisperBinPath: '/from-file' }));
    const kv = memKV();
    saveSettings(kv, { ...defaultSettings(), whisperBinPath: '/from-legacy' });
    expect(resolveSettings(path, io, kv).whisperBinPath).toBe('/from-file');
  });

  it('resolveSettings migrates from legacy localStorage when the file is absent, and writes the file', () => {
    const io = memIO();
    const kv = memKV();
    saveSettings(kv, { ...defaultSettings(), whisperBinPath: '/legacy-whisper' });
    const s = resolveSettings(path, io, kv);
    expect(s.whisperBinPath).toBe('/legacy-whisper');
    expect(io.files.has(path)).toBe(true); // migrated onto disk
    expect(parseSettings(io.files.get(path)!).whisperBinPath).toBe('/legacy-whisper');
  });

  it('resolveSettings writes defaults when neither file nor legacy value exists', () => {
    const io = memIO();
    const s = resolveSettings(path, io, memKV());
    expect(s).toEqual(defaultSettings());
    expect(io.files.has(path)).toBe(true);
  });

  it('resolveSettings treats an empty file as absent and migrates', () => {
    const io = memIO();
    io.files.set(path, '   ');
    const kv = memKV();
    saveSettings(kv, { ...defaultSettings(), diarizeBinPath: '/legacy-d' });
    expect(resolveSettings(path, io, kv).diarizeBinPath).toBe('/legacy-d');
  });
});
