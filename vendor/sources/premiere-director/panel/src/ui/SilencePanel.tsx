import { useState } from 'react';
import type { HostAdapter } from '../adapters/HostAdapter';
import type { Settings } from '../lib/settings';
import type { TimeRange } from '../silence/detect';
import { analyzeSilence, applySilenceCuts, type SilenceAnalysis } from '../silence/pipeline';
import { Knob, StatusBar, Toggle } from './controls';

const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

export function SilencePanel(props: {
  host: HostAdapter; settings: Settings;
  deps: { readFileBuf: (p: string) => Promise<ArrayBuffer>; tmpDir: string };
}) {
  const [analysis, setAnalysis] = useState<SilenceAnalysis | null>(null);
  const [kept, setKept] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const analyze = async () => {
    setBusy(true); setMsg('Exporting + analyzing audio…');
    try {
      const a = await analyzeSilence(props.host, props.settings, props.deps);
      setAnalysis(a);
      setKept(new Set(a.ranges.map((_, i) => i)));
      setMsg(`${a.ranges.length} silent ranges, ${a.totalCutSec.toFixed(1)}s removable`);
    } catch (e) { setMsg(String(e)); } finally { setBusy(false); }
  };

  const apply = async () => {
    if (!analysis) return;
    setBusy(true); setMsg('Applying cuts…');
    try {
      const ranges: TimeRange[] = analysis.ranges.filter((_, i) => kept.has(i));
      const r = await applySilenceCuts(props.host, analysis, ranges);
      setMsg(r.ok ? `Done — ${r.applied} operations applied.` : `Failed: ${r.error ?? 'unknown'} (applied ${r.applied})`);
      if (r.ok) setAnalysis(null);
    } catch (e) { setMsg(String(e)); } finally { setBusy(false); }
  };

  const keptCutSec = analysis
    ? analysis.ranges.filter((_, i) => kept.has(i)).reduce((s, r) => s + (r.endSec - r.startSec), 0)
    : 0;

  return (
    <div className="stack">
      <Knob label="Analyze silence" busy={busy} onClick={analyze} />
      {analysis && (
        <section className="card">
          <p className="eyebrow">Silent ranges <em>{analysis.ranges.length}</em></p>
          <div className="stat">
            <span className="stat-num">{keptCutSec.toFixed(1)}s</span>
            <span className="stat-label">selected to remove</span>
          </div>
          <ul className="rows">
            {analysis.ranges.map((r, i) => (
              <li className="row" key={i}>
                <Toggle
                  checked={kept.has(i)}
                  title={kept.has(i) ? 'Will be removed' : 'Will be kept'}
                  onChange={(on) => setKept((prev) => { const n = new Set(prev); on ? n.add(i) : n.delete(i); return n; })}
                />
                <span className="row-main tc">
                  {fmt(r.startSec)} <span className="tc-dim">→</span> {fmt(r.endSec)}
                </span>
                <span className="tc tc-dim">{(r.endSec - r.startSec).toFixed(1)}s</span>
              </li>
            ))}
          </ul>
          <div className="btn-row">
            <button className="btn btn-danger" disabled={busy || kept.size === 0} onClick={apply}>
              Cut {kept.size} {kept.size === 1 ? 'range' : 'ranges'}
            </button>
          </div>
        </section>
      )}
      <StatusBar busy={busy} text={msg} />
    </div>
  );
}
