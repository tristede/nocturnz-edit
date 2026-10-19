import { useState } from 'react';
import type { HostAdapter } from '../adapters/HostAdapter';
import type { Settings } from '../lib/settings';
import type { CameraMap, SwitchPoint } from '../director/types';
import {
  analyzeDialogue, applyCameraAssignment, applyCameraCuts, autoAssignCameras, planCameraCuts,
  type DirectorAnalysis, type PipelineDeps,
} from '../director/pipeline';
import { longestUtterance, speakerSummaries } from '../director/speakers';
import { Chip, Knob, StatusBar } from './controls';

const SAVED_KEY = 'premiere-director.lastAnalysis';

interface SavedAnalysis { analysis: DirectorAnalysis; mapping: Record<string, number | null>; wide: number | null; savedAt: string; }

function loadSaved(): SavedAnalysis | null {
  try {
    const raw = window.localStorage.getItem(SAVED_KEY);
    return raw ? (JSON.parse(raw) as SavedAnalysis) : null;
  } catch { return null; }
}

let snippetAudio: HTMLAudioElement | null = null;
let snippetTimer: number | undefined;

function playSnippet(wavPath: string, startSec: number, onError: (msg: string) => void): void {
  if (snippetAudio) { snippetAudio.pause(); window.clearTimeout(snippetTimer); }
  const audio = new Audio(`file://${wavPath}`);
  snippetAudio = audio;
  audio.onerror = () => onError('Could not play snippet — the analysis audio was cleaned from the temp folder. Re-run Analyze to restore playback.');
  audio.addEventListener('loadedmetadata', () => {
    audio.currentTime = startSec;
    void audio.play().catch(() => onError('Snippet playback blocked.'));
    snippetTimer = window.setTimeout(() => audio.pause(), 5000);
  });
}

const tcFmt = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(2).padStart(5, '0');
  return `${String(m).padStart(2, '0')}:${sec}`;
};

export function DirectorPanel(props: { host: HostAdapter; settings: Settings; deps: PipelineDeps }) {
  const saved = loadSaved();
  const [analysis, setAnalysis] = useState<DirectorAnalysis | null>(saved?.analysis ?? null);
  const [mapping, setMapping] = useState<Record<string, number | null>>(saved?.mapping ?? {});
  const [wide, setWide] = useState<number | null>(saved?.wide ?? null);
  const [switches, setSwitches] = useState<SwitchPoint[] | null>(null);
  const [numSpeakers, setNumSpeakers] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const cfg = props.settings.director;
  const cameraMap = (): CameraMap => ({ speakerToTrack: mapping, wideTrackIndex: wide });
  const initialTrack = () => {
    const first = Object.values(mapping).find((t) => t != null);
    return first ?? 0;
  };
  const persist = (a: DirectorAnalysis, m: Record<string, number | null>, w: number | null) => {
    try {
      window.localStorage.setItem(SAVED_KEY, JSON.stringify({ analysis: a, mapping: m, wide: w, savedAt: new Date().toISOString() } satisfies SavedAnalysis));
    } catch { /* quota or unavailable — persistence is best-effort */ }
  };

  const analyze = async () => {
    setBusy(true); setMsg('Transcribing + diarizing (this can take a while)…');
    try {
      const n = Number(numSpeakers);
      const a = await analyzeDialogue(props.host, props.settings, props.deps, Number.isInteger(n) && n > 0 ? n : undefined);
      const freshMapping = Object.fromEntries(a.speakers.map((s) => [s, null]));
      setAnalysis(a); setSwitches(null);
      setMapping(freshMapping);
      persist(a, freshMapping, wide);
      setMsg(`${a.utterances.length} utterances, ${a.speakers.length} speakers detected.`);
    } catch (e) { setMsg(String(e)); } finally { setBusy(false); }
  };

  const plan = () => {
    if (!analysis) return;
    const sw = planCameraCuts(analysis, cameraMap(), cfg, initialTrack());
    setSwitches(sw);
    setMsg(`${sw.length} camera switches planned.`);
  };

  const apply = async () => {
    if (!analysis || !switches) return;
    setBusy(true); setMsg('Cutting…');
    try {
      const r = await applyCameraCuts(props.host, analysis, switches, cameraMap(), initialTrack());
      setMsg(r.ok
        ? `Done — ${r.applied} operations. To change which speaker is on which camera, adjust the mapping above and click "Re-apply camera assignment".`
        : `Failed: ${r.error ?? 'unknown'}`);
      if (r.ok) { setSwitches(null); persist(analysis, mapping, wide); }
    } catch (e) { setMsg(String(e)); } finally { setBusy(false); }
  };

  const autoAssign = async () => {
    if (!analysis) return;
    setBusy(true); setMsg('Auto-assigning: soloing each camera mic and measuring (two quick exports)…');
    try {
      const r = await autoAssignCameras(props.host, analysis, props.settings, props.deps);
      const newMapping = { ...mapping, ...r.assignments };
      setMapping(newMapping);
      persist(analysis, newMapping, wide);
      const detail = Object.entries(r.assignments)
        .map(([spk, track]) => `${spk} → V${track + 1} (${Math.round((r.confidence[spk] ?? 0) * 100)}%)`)
        .join(', ');
      setMsg(`Auto-assigned: ${detail}. Review (play ▶ snippets to confirm) then Plan switches.`);
    } catch (e) { setMsg(String(e)); } finally { setBusy(false); }
  };

  const reset = () => {
    if (snippetAudio) { snippetAudio.pause(); window.clearTimeout(snippetTimer); snippetAudio = null; }
    setAnalysis(null);
    setMapping({});
    setWide(null);
    setSwitches(null);
    setNumSpeakers('');
    try { window.localStorage.removeItem(SAVED_KEY); } catch { /* best-effort */ }
    setMsg('Reset. Open the next multicam sequence in Premiere, then Analyze dialogue.');
  };

  const reassign = async () => {
    if (!analysis) return;
    setBusy(true); setMsg('Updating clip enables for the new camera assignment…');
    try {
      const r = await applyCameraAssignment(props.host, analysis, cameraMap(), cfg, initialTrack());
      setMsg(r.ok
        ? `Camera assignment updated — ${r.applied} clip enable changes (existing cuts untouched).`
        : `Failed: ${r.error ?? 'unknown'}`);
      if (r.ok) persist(analysis, mapping, wide);
    } catch (e) { setMsg(String(e)); } finally { setBusy(false); }
  };

  const tracks = analysis?.seq.videoTracks ?? [];
  return (
    <div className="stack">
      <Knob label="Analyze dialogue" busy={busy} onClick={analyze} />
      <div className="field-inline" style={{ justifyContent: 'center' }}>
        <span className="field-label">Speakers</span>
        <input className="num-input" inputMode="numeric" value={numSpeakers} placeholder="auto"
          onChange={(e) => setNumSpeakers(e.target.value)} />
      </div>
      <p className="hint" style={{ textAlign: 'center' }}>
        Cameras stacked on V1–Vn, synced, with dialogue audio in the sequence. Leave speakers blank to auto-detect (may over-split).
      </p>

      {analysis && (
        <section className="card">
          <p className="eyebrow">Speaker <em>→</em> camera</p>
          <div className="btn-row" style={{ marginTop: 0, marginBottom: 10 }}>
            <button className="btn btn-accent" disabled={busy} onClick={autoAssign}
              title="Solos each camera's own audio track and measures which mic favors each speaker. Needs per-camera scratch audio in the sequence.">
              Auto-assign from camera mics
            </button>
          </div>
          <ul className="rows">
            {speakerSummaries(analysis.utterances).map((sum) => {
              const s = sum.speakerId;
              const sample = longestUtterance(analysis.utterances, s);
              return (
                <li className="row" key={s} style={{ flexWrap: 'wrap' }}>
                  <span className="row-main">
                    <strong>{s}</strong>
                    <span className="tc tc-dim" style={{ marginLeft: 6 }}>{(sum.totalSec / 60).toFixed(1)} min</span>
                    {sum.quotes[0] && <span className="quote" style={{ display: 'block' }}>“{sum.quotes[0].slice(0, 110)}”</span>}
                  </span>
                  {sample && analysis.wavPath && (
                    <button className="btn btn-play" disabled={busy} title="Play a 5-second snippet of this speaker"
                      onClick={() => playSnippet(analysis.wavPath, sample.startSec + Math.max(0, (sample.endSec - sample.startSec) / 2 - 2.5), setMsg)}>
                      ▶
                    </button>
                  )}
                  <select value={mapping[s] ?? ''}
                    onChange={(e) => setMapping({ ...mapping, [s]: e.target.value === '' ? null : Number(e.target.value) })}>
                    <option value="">off-camera</option>
                    {tracks.map((t) => <option key={t.index} value={t.index}>V{t.index + 1} {t.name}</option>)}
                  </select>
                </li>
              );
            })}
            <li className="row">
              <span className="row-main field-label" style={{ marginBottom: 0 }}>Wide shot</span>
              <select value={wide ?? ''} onChange={(e) => setWide(e.target.value === '' ? null : Number(e.target.value))}>
                <option value="">none</option>
                {tracks.map((t) => <option key={t.index} value={t.index}>V{t.index + 1} {t.name}</option>)}
              </select>
            </li>
          </ul>
          <div className="btn-row">
            <button className="btn btn-accent" disabled={busy} onClick={plan}>Plan switches</button>
            <button className="btn" disabled={busy || Object.values(mapping).every((t) => t == null)} onClick={reassign}
              title="Recomputes which camera is enabled in each existing segment for the current mapping. Does not add or move cuts.">
              Re-apply camera assignment
            </button>
            <button className="btn btn-ghost" disabled={busy} onClick={reset}
              title="Clears the analysis, speaker mapping, and planned switches so you can start on another timeline. Applied cuts stay in Premiere.">
              Start over
            </button>
          </div>
        </section>
      )}

      {switches && (
        <section className="card">
          <p className="eyebrow">Cut list <em>{switches.length}</em></p>
          <ol className="rows">
            {switches.map((s, i) => (
              <li className="row" key={i}>
                <span className="tc">{tcFmt(s.timeSec)}</span>
                <Chip>{`V${s.toTrackIndex + 1}`}</Chip>
                <span className="row-main reason">{s.reason}</span>
                <button className="btn btn-ghost" title="Remove this switch"
                  onClick={() => setSwitches(switches.filter((_, k) => k !== i))}>✕</button>
              </li>
            ))}
          </ol>
          <div className="btn-row">
            <button className="btn btn-danger" disabled={busy || switches.length === 0} onClick={apply}>
              Cut {switches.length} {switches.length === 1 ? 'switch' : 'switches'}
            </button>
          </div>
        </section>
      )}

      <StatusBar busy={busy} text={msg} />
    </div>
  );
}
