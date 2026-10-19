// Shared soft-UI controls. Purely presentational — no pipeline logic here.

export function Knob(props: { label: string; busy: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      className={`knob-wrap${props.busy ? ' knob-busy' : ''}`}
      disabled={props.disabled || props.busy}
      onClick={props.onClick}
      aria-busy={props.busy}
    >
      <span className="knob">
        <svg className="knob-ring" viewBox="0 0 100 100" aria-hidden="true">
          <circle className="knob-ring-track" cx="50" cy="50" r="46" />
          <circle className="knob-ring-arc" cx="50" cy="50" r="46" />
        </svg>
        <span className="knob-face" />
      </span>
      <span className="knob-label">{props.busy ? 'Working…' : props.label}</span>
    </button>
  );
}

export function Toggle(props: { checked: boolean; onChange: (checked: boolean) => void; title?: string }) {
  return (
    <span className="toggle" title={props.title}>
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      <span className="toggle-track" />
    </span>
  );
}

export function Chip(props: { children: string }) {
  return <span className="chip">{props.children}</span>;
}

const ERRORISH = /fail|error|could not|cannot|out of range|no active|missing|blocked|invalid/i;

export function StatusBar(props: { busy: boolean; text: string }) {
  const tone = props.busy ? 'status-busy' : ERRORISH.test(props.text) ? 'status-error' : '';
  return (
    <div className={`status ${tone}`} role="status" aria-live="polite">
      <span className="status-dot" />
      <span className="status-text">{props.text || 'Ready.'}</span>
    </div>
  );
}

export function Masthead() {
  return (
    <header className="masthead">
      <svg className="masthead-ring" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="42" />
      </svg>
      <span className="masthead-name">Premiere Director</span>
    </header>
  );
}
