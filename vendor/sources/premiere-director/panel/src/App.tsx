import { useMemo, useState } from 'react';
import { CepAdapter } from './adapters/CepAdapter';
import type { HostAdapter } from './adapters/HostAdapter';
import {
  defaultSettings, localStorageKV, resolveSettings, saveSettingsFile, settingsFilePath,
  type Settings, type SettingsFileIO,
} from './lib/settings';
import { SilencePanel } from './ui/SilencePanel';
import { DirectorPanel } from './ui/DirectorPanel';
import { Masthead } from './ui/controls';
import { nodeRunner } from './asr/run';

function nodeSettingsIO(): SettingsFileIO {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  return {
    read: (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } },
    write: (p, d) => fs.writeFileSync(p, d),
    ensureDir: (p) => fs.mkdirSync(path.dirname(p), { recursive: true }),
  };
}

function homeDir(): string {
  return (require('os') as typeof import('os')).homedir();
}

function nodeDeps() {
  const fs = require('fs') as typeof import('fs');
  const os = require('os') as typeof import('os');
  return {
    run: nodeRunner,
    readFile: async (p: string) => fs.readFileSync(p, 'utf8'),
    readFileBuf: async (p: string) => {
      const b = fs.readFileSync(p);
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    },
    tmpDir: os.tmpdir(),
  };
}

export function App() {
  const [tab, setTab] = useState<'silence' | 'director' | 'settings'>('silence');
  const settingsPath = useMemo(() => { try { return settingsFilePath(homeDir()); } catch { return ''; } }, []);
  const settingsIO = useMemo(nodeSettingsIO, []);
  const [settings, setSettings] = useState<Settings>(() => {
    try { return resolveSettings(settingsPath, settingsIO, localStorageKV); } catch { return defaultSettings(); }
  });
  const host: HostAdapter | null = useMemo(() => {
    try { return new CepAdapter(); } catch { return null; }
  }, []);
  const deps = useMemo(nodeDeps, []);

  const update = (s: Settings) => {
    setSettings(s);
    try { saveSettingsFile(settingsPath, s, settingsIO); } catch { /* best-effort */ }
  };

  // This guards against the CepAdapter constructor throwing (no __adobe_cep__ on window),
  // which happens when evalScript is unavailable even though CEP itself is present. The
  // bundle imports './asr/run' at module scope, which pulls in Node's 'child_process' at
  // load time, so this branch can never actually render outside a CEP/Node host — but we
  // keep the message for the case where CEP is present without a usable evalScript bridge.
  if (!host) return <div className="app"><p className="empty">Premiere Director must run inside Premiere Pro.</p></div>;
  return (
    <div className="app stack">
      <Masthead />
      <nav className="tabs">
        {(['silence', 'director', 'settings'] as const).map((t) => (
          <button key={t} className={`tab${tab === t ? ' tab-active' : ''}`} disabled={tab === t} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>
      {tab === 'silence' && <SilencePanel host={host} settings={settings} deps={deps} />}
      {tab === 'director' && <DirectorPanel host={host} settings={settings} deps={deps} />}
      {tab === 'settings' && <SettingsForm settings={settings} onChange={update} />}
    </div>
  );
}

function SettingsForm({ settings, onChange }: { settings: Settings; onChange: (s: Settings) => void }) {
  const [dl, setDl] = useState('');
  const path = (label: string, key: keyof Settings) => (
    <label className="field">
      <span className="field-label">{label}</span>
      <input value={String(settings[key])} spellCheck={false}
        onChange={(e) => onChange({ ...settings, [key]: e.target.value })} />
    </label>
  );
  const downloadModel = async () => {
    // Explicit, user-initiated, audit-logged network call — the only one in v1.
    const os = require('os') as typeof import('os');
    const fs = require('fs') as typeof import('fs');
    const pathMod = require('path') as typeof import('path');
    const { downloadFile, WHISPER_MODEL_URL } = await import('./asr/download');
    const { appendAudit } = await import('./audit/log');
    const dataDir = pathMod.join(os.homedir(), '.premiere-director');
    fs.mkdirSync(dataDir, { recursive: true });
    const dest = pathMod.join(dataDir, 'ggml-base.en.bin');
    setDl('Downloading…');
    try {
      appendAudit(pathMod.join(dataDir, 'audit.jsonl'),
        { ts: new Date().toISOString(), url: WHISPER_MODEL_URL, purpose: 'whisper model download', destFile: dest });
      await downloadFile(WHISPER_MODEL_URL, dest, (pct) => setDl(`Downloading… ${pct}%`));
      onChange({ ...settings, whisperModelPath: dest });
      setDl('Model downloaded.');
    } catch (e) { setDl(String(e)); }
  };
  return (
    <div className="stack">
      <section className="card">
        <p className="eyebrow">Transcription</p>
        {path('whisper-cli binary', 'whisperBinPath')}
        {path('whisper model (.bin)', 'whisperModelPath')}
        <div className="btn-row" style={{ alignItems: 'center' }}>
          <button className="btn btn-accent" onClick={downloadModel}>Download base.en model</button>
          <span className="hint">{dl}</span>
        </div>
      </section>
      <section className="card">
        <p className="eyebrow">Diarization</p>
        {path('sherpa-onnx diarization binary', 'diarizeBinPath')}
        {path('segmentation model', 'diarizeSegModelPath')}
        {path('embedding model', 'diarizeEmbModelPath')}
      </section>
      <section className="card">
        <p className="eyebrow">Audio export</p>
        {path('WAV export preset (.epr)', 'wavPresetPath')}
      </section>
    </div>
  );
}
