# Premiere Director v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Premiere Director CEP panel MVP: panel skeleton + ExtendScript bridge + typed operation executor, local silence removal, and rule-driven automatic camera switching over stacked camera tracks.

**Architecture:** A CEP 12 panel (TypeScript + React + Vite, Node 17 in-process) talks to a single ExtendScript executor through a `HostAdapter` seam. All edit mutations are closed, schema-validated JSON operation batches. Silence detection and the camera-director rule engine are pure, unit-tested TS modules; ASR (whisper.cpp) and diarization (sherpa-onnx CLI) run as spawned local binaries.

**Tech Stack:** TypeScript 5, React 18, Vite 5, vitest; ExtendScript (ES3) + QE DOM host layer; whisper.cpp and sherpa-onnx as external CLI binaries.

## Global Constraints

- License: MIT. No Adobe/AI-vendor branding. Bundle ID `org.premieredirector.panel`, name "Premiere Director".
- CEP 12 / CSXS 12; host `PPRO` version range `[26.0,99.9]`; panel JS targets Chromium 99 / ES2020; in-process Node is 17.7.1 (no Node 18+ APIs — no global `fetch` in Node context; use `https`).
- ExtendScript is ES3: `/host/*.jsx` uses `var`, no arrow functions, no `const`, JSON via bundled `json2.jsx`.
- `TICKS_PER_SECOND = 254016000000` (Premiere ticks). Panel domain uses seconds (number); ticks/timecode conversion happens at the edges.
- Zero network calls except explicit, logged ASR model/binary downloads. No telemetry. No hardcoded keys.
- Every mutation crosses the bridge only as a validated `OperationBatch`; the panel never sends raw script strings beyond the fixed `PD_*` entry points.
- All new pure-logic modules get vitest coverage before implementation (TDD). ExtendScript host code is covered by the manual integration checklist (Task 18) instead.
- Commit after every task (at minimum); commit messages `feat:`/`test:`/`chore:` style, each ending with the Claude co-author trailer.

---

### Task 1: Project scaffold and build pipeline

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `.gitignore`
- Create: `panel/index.html`, `panel/src/main.tsx`, `panel/src/App.tsx`, `panel/src/app.css`
- Create: `csxs/manifest.xml`, `csxs/.debug`
- Create: `scripts/build-host.mjs`, `scripts/dev-install.sh`
- Create: `panel/src/lib/sanity.test.ts` (temporary vitest sanity check)

**Interfaces:**
- Consumes: nothing.
- Produces: `npm run build` → `dist/` containing `index.html` + assets, `CSXS/manifest.xml`, `.debug`, `host/index.jsx`. `npm test` runs vitest. All later tasks assume this layout and the path aliases below.

- [ ] **Step 1: Write config files**

`package.json`:

```json
{
  "name": "premiere-director",
  "version": "0.1.0",
  "private": true,
  "license": "MIT",
  "type": "module",
  "scripts": {
    "dev": "vite build --watch",
    "build": "vite build && node scripts/build-host.mjs",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/node": "^17.0.45",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "typescript": "^5.5.4",
    "vite": "^5.4.0",
    "vitest": "^2.0.5"
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["panel/src"]
}
```

`vite.config.ts` (base `'./'` is required — CEP loads index.html from disk):

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'panel',
  base: './',
  plugins: [react()],
  build: {
    outDir: '../dist',
    emptyOutDir: false,
    target: 'chrome99',
    rollupOptions: {
      external: ['fs', 'path', 'child_process', 'https', 'os', 'crypto'],
      output: { format: 'iife' },
    },
  },
  test: { include: ['src/**/*.test.ts'] },
});
```

`.gitignore`:

```
node_modules/
dist/
*.p12
*.zxp
```

- [ ] **Step 2: Write panel entry files**

`panel/index.html`:

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Premiere Director</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./src/main.tsx"></script>
  </body>
</html>
```

`panel/src/main.tsx`:

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './app.css';

createRoot(document.getElementById('root')!).render(<App />);
```

`panel/src/App.tsx`:

```tsx
export function App() {
  return (
    <div className="app">
      <h1>Premiere Director</h1>
      <p>Panel skeleton — features land in later tasks.</p>
    </div>
  );
}
```

`panel/src/app.css`:

```css
body { margin: 0; background: #232323; color: #d6d6d6; font: 12px/1.5 -apple-system, "Segoe UI", sans-serif; }
.app { padding: 12px; }
h1 { font-size: 14px; }
```

- [ ] **Step 3: Write CEP manifest and debug file**

`csxs/manifest.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ExtensionManifest Version="12.0" ExtensionBundleId="org.premieredirector.panel"
  ExtensionBundleVersion="0.1.0" ExtensionBundleName="Premiere Director"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <ExtensionList>
    <Extension Id="org.premieredirector.panel.main" Version="0.1.0" />
  </ExtensionList>
  <ExecutionEnvironment>
    <HostList>
      <Host Name="PPRO" Version="[26.0,99.9]" />
    </HostList>
    <LocaleList><Locale Code="All" /></LocaleList>
    <RequiredRuntimeList><RequiredRuntime Name="CSXS" Version="12.0" /></RequiredRuntimeList>
  </ExecutionEnvironment>
  <DispatchInfoList>
    <Extension Id="org.premieredirector.panel.main">
      <DispatchInfo>
        <Resources>
          <MainPath>./index.html</MainPath>
          <ScriptPath>./host/index.jsx</ScriptPath>
          <CEFCommandLine>
            <Parameter>--enable-nodejs</Parameter>
            <Parameter>--mixed-context</Parameter>
            <Parameter>--allow-file-access</Parameter>
            <Parameter>--allow-file-access-from-files</Parameter>
          </CEFCommandLine>
        </Resources>
        <Lifecycle><AutoVisible>true</AutoVisible></Lifecycle>
        <UI>
          <Type>Panel</Type>
          <Menu>Premiere Director</Menu>
          <Geometry><Size><Height>600</Height><Width>420</Width></Size></Geometry>
        </UI>
      </DispatchInfo>
    </Extension>
  </DispatchInfoList>
</ExtensionManifest>
```

`csxs/.debug`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ExtensionList>
  <Extension Id="org.premieredirector.panel.main">
    <HostList><Host Name="PPRO" Port="7002" /></HostList>
  </Extension>
</ExtensionList>
```

- [ ] **Step 4: Write host build + dev-install scripts**

`scripts/build-host.mjs` (concatenates `host/*.jsx` in order, copies CSXS files into `dist/`):

```js
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const root = new URL('..', import.meta.url).pathname;
const dist = join(root, 'dist');
mkdirSync(join(dist, 'host'), { recursive: true });
mkdirSync(join(dist, 'CSXS'), { recursive: true });

const hostDir = join(root, 'host');
const order = ['json2.jsx', 'index.jsx'];
const parts = order
  .filter((f) => existsSync(join(hostDir, f)))
  .map((f) => readFileSync(join(hostDir, f), 'utf8'));
writeFileSync(join(dist, 'host', 'index.jsx'), parts.join('\n\n'));

copyFileSync(join(root, 'csxs', 'manifest.xml'), join(dist, 'CSXS', 'manifest.xml'));
copyFileSync(join(root, 'csxs', '.debug'), join(dist, '.debug'));
if (existsSync(join(root, 'assets'))) {
  for (const f of readdirSync(join(root, 'assets'))) {
    copyFileSync(join(root, 'assets', f), join(dist, f));
  }
}
console.log('host + CSXS staged into dist/');
```

Create `host/json2.jsx` as a placeholder for now (Task 10 replaces it with the real polyfill):

```js
// json2.jsx placeholder — replaced in Task 10 with Douglas Crockford's json2 polyfill.
```

And `host/index.jsx` placeholder:

```js
// Premiere Director host bridge — implemented in Task 10.
function PD_ping() { return 'pong'; }
```

`scripts/dev-install.sh`:

```bash
#!/usr/bin/env bash
# Dev-install: enable PlayerDebugMode for CSXS 12 and symlink dist/ into user CEP extensions.
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
EXT_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions"
LINK="$EXT_DIR/premiere-director"
defaults write com.adobe.CSXS.12 PlayerDebugMode 1
mkdir -p "$EXT_DIR"
rm -f "$LINK"
ln -s "$REPO_DIR/dist" "$LINK"
echo "Linked $LINK -> $REPO_DIR/dist"
echo "Restart Premiere Pro, then open Window > Extensions > Premiere Director."
```

Run: `chmod +x scripts/dev-install.sh`

- [ ] **Step 5: Write sanity test**

`panel/src/lib/sanity.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

describe('toolchain', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Install and verify**

Run: `npm install`
Run: `npm test` — Expected: 1 test PASS.
Run: `npm run build` — Expected: exits 0; `ls dist` shows `index.html`, `assets/` (vite), `CSXS/manifest.xml`, `.debug`, `host/index.jsx`.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: CEP panel scaffold, manifest, build pipeline, dev-install script"
```

---

### Task 2: Time utilities and structure hash

**Files:**
- Create: `panel/src/lib/time.ts`, `panel/src/lib/hash.ts`
- Test: `panel/src/lib/time.test.ts`, `panel/src/lib/hash.test.ts`

**Interfaces:**
- Produces: `TICKS_PER_SECOND: number`; `secondsToTicks(sec: number): string`; `ticksToSeconds(ticks: string): number`; `structureHash(value: unknown): string` (stable across key order; used for sequence staleness checks).

- [ ] **Step 1: Write failing tests**

`panel/src/lib/time.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { TICKS_PER_SECOND, secondsToTicks, ticksToSeconds } from './time';

describe('ticks conversion', () => {
  it('has the Premiere ticks constant', () => {
    expect(TICKS_PER_SECOND).toBe(254016000000);
  });
  it('round-trips seconds', () => {
    expect(secondsToTicks(1)).toBe('254016000000');
    expect(ticksToSeconds('508032000000')).toBe(2);
    expect(ticksToSeconds(secondsToTicks(3.5))).toBeCloseTo(3.5, 9);
  });
});
```

`panel/src/lib/hash.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { structureHash } from './hash';

describe('structureHash', () => {
  it('is stable regardless of key order', () => {
    expect(structureHash({ a: 1, b: [2, 3] })).toBe(structureHash({ b: [2, 3], a: 1 }));
  });
  it('differs when values differ', () => {
    expect(structureHash({ a: 1 })).not.toBe(structureHash({ a: 2 }));
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run panel/src/lib/time.test.ts panel/src/lib/hash.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`panel/src/lib/time.ts`:

```ts
export const TICKS_PER_SECOND = 254016000000;

export function secondsToTicks(sec: number): string {
  return String(Math.round(sec * TICKS_PER_SECOND));
}

export function ticksToSeconds(ticks: string): number {
  return Number(ticks) / TICKS_PER_SECOND;
}
```

`panel/src/lib/hash.ts` (FNV-1a over a stable stringify):

```ts
function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

export function structureHash(value: unknown): string {
  const s = stableStringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
```

- [ ] **Step 4: Run tests** — Expected: PASS. Also delete `panel/src/lib/sanity.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: ticks conversion and stable structure hash utilities"
```

---

### Task 3: Sequence model and edit-operation schema

**Files:**
- Create: `panel/src/operations/model.ts` (sequence read model), `panel/src/operations/schema.ts` (operations + validator)
- Test: `panel/src/operations/schema.test.ts`

**Interfaces:**
- Produces (used by every later task):

```ts
// model.ts
export interface ClipInfo { index: number; nodeId: string; name: string; startSec: number; endSec: number; enabled: boolean; }
export interface TrackInfo { index: number; name: string; clips: ClipInfo[]; }
export interface SequenceInfo { name: string; endSec: number; fps: number; videoTracks: TrackInfo[]; audioTracks: TrackInfo[]; }

// schema.ts
export type Operation =
  | { type: 'razorAll'; timeSec: number }
  | { type: 'rippleDelete'; trackType: 'video' | 'audio'; trackIndex: number; clipIndex: number }
  | { type: 'setClipEnabled'; trackType: 'video'; trackIndex: number; clipIndex: number; enabled: boolean };
export interface OperationBatch { ops: Operation[]; }
export type ValidationResult = { ok: true; batch: OperationBatch } | { ok: false; errors: string[] };
export function validateBatch(input: unknown): ValidationResult;
```

- [ ] **Step 1: Write failing tests**

`panel/src/operations/schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { validateBatch } from './schema';

describe('validateBatch', () => {
  it('accepts a valid batch', () => {
    const r = validateBatch({
      ops: [
        { type: 'razorAll', timeSec: 1.5 },
        { type: 'rippleDelete', trackType: 'video', trackIndex: 0, clipIndex: 2 },
        { type: 'setClipEnabled', trackType: 'video', trackIndex: 1, clipIndex: 0, enabled: false },
      ],
    });
    expect(r.ok).toBe(true);
  });
  it('rejects unknown op types (closed set)', () => {
    const r = validateBatch({ ops: [{ type: 'evalScript', code: 'alert(1)' }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/unknown op type/i);
  });
  it('rejects negative times and indices, non-arrays, missing fields', () => {
    expect(validateBatch({ ops: [{ type: 'razorAll', timeSec: -1 }] }).ok).toBe(false);
    expect(validateBatch({ ops: [{ type: 'rippleDelete', trackType: 'video', trackIndex: -1, clipIndex: 0 }] }).ok).toBe(false);
    expect(validateBatch({ ops: 'nope' }).ok).toBe(false);
    expect(validateBatch({ ops: [{ type: 'setClipEnabled', trackType: 'video', trackIndex: 0, clipIndex: 0 }] }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run panel/src/operations/schema.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`panel/src/operations/model.ts`: exactly the interfaces from the Interfaces block above (no logic).

`panel/src/operations/schema.ts`:

```ts
export type Operation =
  | { type: 'razorAll'; timeSec: number }
  | { type: 'rippleDelete'; trackType: 'video' | 'audio'; trackIndex: number; clipIndex: number }
  | { type: 'setClipEnabled'; trackType: 'video'; trackIndex: number; clipIndex: number; enabled: boolean };

export interface OperationBatch { ops: Operation[]; }
export type ValidationResult = { ok: true; batch: OperationBatch } | { ok: false; errors: string[] };

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isIdx = (v: unknown): v is number => isNum(v) && v >= 0 && Number.isInteger(v);

function validateOp(op: unknown, i: number, errors: string[]): void {
  if (typeof op !== 'object' || op === null) { errors.push(`op[${i}]: not an object`); return; }
  const o = op as Record<string, unknown>;
  switch (o.type) {
    case 'razorAll':
      if (!isNum(o.timeSec) || o.timeSec < 0) errors.push(`op[${i}]: razorAll.timeSec must be >= 0`);
      return;
    case 'rippleDelete':
      if (o.trackType !== 'video' && o.trackType !== 'audio') errors.push(`op[${i}]: bad trackType`);
      if (!isIdx(o.trackIndex)) errors.push(`op[${i}]: bad trackIndex`);
      if (!isIdx(o.clipIndex)) errors.push(`op[${i}]: bad clipIndex`);
      return;
    case 'setClipEnabled':
      if (o.trackType !== 'video') errors.push(`op[${i}]: setClipEnabled only supports video`);
      if (!isIdx(o.trackIndex)) errors.push(`op[${i}]: bad trackIndex`);
      if (!isIdx(o.clipIndex)) errors.push(`op[${i}]: bad clipIndex`);
      if (typeof o.enabled !== 'boolean') errors.push(`op[${i}]: enabled must be boolean`);
      return;
    default:
      errors.push(`op[${i}]: unknown op type "${String(o.type)}"`);
  }
}

export function validateBatch(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (typeof input !== 'object' || input === null || !Array.isArray((input as { ops?: unknown }).ops)) {
    return { ok: false, errors: ['batch.ops must be an array'] };
  }
  const ops = (input as { ops: unknown[] }).ops;
  ops.forEach((op, i) => validateOp(op, i, errors));
  return errors.length ? { ok: false, errors } : { ok: true, batch: { ops: ops as Operation[] } };
}
```

- [ ] **Step 4: Run tests** — Expected: PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: sequence model and closed edit-operation schema with validator"`

---

### Task 4: WAV parser

**Files:**
- Create: `panel/src/silence/wav.ts`
- Test: `panel/src/silence/wav.test.ts`

**Interfaces:**
- Produces: `parseWav(buf: ArrayBuffer): { sampleRate: number; samples: Float32Array }` — supports PCM 16-bit; mono or downmixes by taking channel 0; throws `Error` with a readable message on non-PCM.

- [ ] **Step 1: Write failing test** (builds a tiny WAV in-memory)

`panel/src/silence/wav.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseWav } from './wav';

function makeWav(samples: number[], sampleRate = 16000, channels = 1): ArrayBuffer {
  const dataLen = samples.length * 2;
  const buf = new ArrayBuffer(44 + dataLen);
  const v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + dataLen, true); w(8, 'WAVE');
  w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * channels * 2, true);
  v.setUint16(32, channels * 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, dataLen, true);
  samples.forEach((s, i) => v.setInt16(44 + i * 2, Math.round(s * 32767), true));
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
});
```

- [ ] **Step 2: Run to verify failure** — FAIL (module not found).

- [ ] **Step 3: Implement**

`panel/src/silence/wav.ts`:

```ts
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
  if (fmt.bits !== 16) throw new Error(`unsupported bit depth ${fmt.bits} (need 16)`);

  const frameCount = Math.floor(data.len / (2 * fmt.channels));
  const samples = new Float32Array(frameCount);
  for (let i = 0; i < frameCount; i++) {
    samples[i] = v.getInt16(data.start + i * 2 * fmt.channels, true) / 32768;
  }
  return { sampleRate: fmt.sampleRate, samples };
}
```

- [ ] **Step 4: Run tests** — Expected: PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: 16-bit PCM WAV parser"`

---

### Task 5: Silence detector

**Files:**
- Create: `panel/src/silence/detect.ts`
- Test: `panel/src/silence/detect.test.ts`

**Interfaces:**
- Produces:

```ts
export interface TimeRange { startSec: number; endSec: number; }
export interface SilenceConfig { thresholdDb: number; minSilenceMs: number; paddingMs: number; minKeepMs: number; windowMs: number; }
export const DEFAULT_SILENCE_CONFIG: SilenceConfig; // { thresholdDb: -40, minSilenceMs: 600, paddingMs: 120, minKeepMs: 250, windowMs: 20 }
export function detectSilence(samples: Float32Array, sampleRate: number, cfg: SilenceConfig): TimeRange[];
```

Semantics: windowed RMS→dBFS; windows below `thresholdDb` are silent; contiguous silent runs shorter than `minSilenceMs` are ignored; each kept range is shrunk by `paddingMs` on both ends (padding preserves natural breath room); ranges that would leave a loud island shorter than `minKeepMs` between them get merged.

- [ ] **Step 1: Write failing tests**

`panel/src/silence/detect.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_SILENCE_CONFIG, detectSilence } from './detect';

const SR = 16000;
function signal(parts: Array<{ sec: number; amp: number }>): Float32Array {
  const total = parts.reduce((s, p) => s + p.sec, 0);
  const out = new Float32Array(Math.round(total * SR));
  let i = 0;
  for (const p of parts) {
    const n = Math.round(p.sec * SR);
    for (let k = 0; k < n; k++) out[i++] = p.amp * Math.sin((2 * Math.PI * 220 * k) / SR);
  }
  return out;
}

describe('detectSilence', () => {
  const cfg = { ...DEFAULT_SILENCE_CONFIG, paddingMs: 0 };
  it('finds a long middle silence', () => {
    const s = signal([{ sec: 1, amp: 0.5 }, { sec: 2, amp: 0.001 }, { sec: 1, amp: 0.5 }]);
    const r = detectSilence(s, SR, cfg);
    expect(r).toHaveLength(1);
    expect(r[0]!.startSec).toBeCloseTo(1, 1);
    expect(r[0]!.endSec).toBeCloseTo(3, 1);
  });
  it('ignores silences shorter than minSilenceMs', () => {
    const s = signal([{ sec: 1, amp: 0.5 }, { sec: 0.3, amp: 0.001 }, { sec: 1, amp: 0.5 }]);
    expect(detectSilence(s, SR, cfg)).toHaveLength(0);
  });
  it('applies padding', () => {
    const s = signal([{ sec: 1, amp: 0.5 }, { sec: 2, amp: 0.001 }, { sec: 1, amp: 0.5 }]);
    const r = detectSilence(s, SR, { ...cfg, paddingMs: 200 });
    expect(r[0]!.startSec).toBeCloseTo(1.2, 1);
    expect(r[0]!.endSec).toBeCloseTo(2.8, 1);
  });
  it('merges ranges separated by a too-short loud island', () => {
    const s = signal([
      { sec: 1, amp: 0.5 }, { sec: 1, amp: 0.001 }, { sec: 0.1, amp: 0.5 },
      { sec: 1, amp: 0.001 }, { sec: 1, amp: 0.5 },
    ]);
    const r = detectSilence(s, SR, cfg);
    expect(r).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify failure** — FAIL.

- [ ] **Step 3: Implement**

`panel/src/silence/detect.ts`:

```ts
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
```

- [ ] **Step 4: Run tests** — Expected: PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: windowed RMS silence detector with padding and island merging"`

---

### Task 6: Silence-removal operation compilers

**Files:**
- Create: `panel/src/silence/compile.ts`
- Test: `panel/src/silence/compile.test.ts`

**Interfaces:**
- Consumes: `TimeRange` (Task 5), `SequenceInfo`/`ClipInfo` (Task 3), `Operation` (Task 3).
- Produces:

```ts
export function compileRazorOps(times: number[]): Operation[]; // one razorAll per unique ascending time
export function razorTimesForRanges(ranges: TimeRange[]): number[]; // both boundaries of each range
export function selectDeleteOps(seq: SequenceInfo, ranges: TimeRange[]): Operation[];
// rippleDelete ops for clips fully inside a range (epsilon 1ms), primary track only
// (first video track that has clips, else first audio track), ordered DESCENDING by clip start
// so ripple shifts don't invalidate later references. Linked A/V follows the deleted item in Premiere.
```

- [ ] **Step 1: Write failing tests**

`panel/src/silence/compile.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { SequenceInfo } from '../operations/model';
import { compileRazorOps, razorTimesForRanges, selectDeleteOps } from './compile';

function seqWithClips(clips: Array<[number, number]>): SequenceInfo {
  return {
    name: 'test', endSec: 100, fps: 30,
    videoTracks: [{
      index: 0, name: 'V1',
      clips: clips.map(([s, e], i) => ({ index: i, nodeId: `n${i}`, name: `c${i}`, startSec: s, endSec: e, enabled: true })),
    }],
    audioTracks: [],
  };
}

describe('silence compile', () => {
  it('razors both boundaries of each range, deduped and sorted', () => {
    const times = razorTimesForRanges([{ startSec: 2, endSec: 4 }, { startSec: 4, endSec: 6 }]);
    expect(times).toEqual([2, 4, 6]);
    expect(compileRazorOps(times)).toEqual([
      { type: 'razorAll', timeSec: 2 }, { type: 'razorAll', timeSec: 4 }, { type: 'razorAll', timeSec: 6 },
    ]);
  });
  it('selects only clips fully inside ranges, descending order', () => {
    // post-razor timeline: [0-2][2-4][4-6][6-8]; silence ranges 2-4 and 6-8
    const seq = seqWithClips([[0, 2], [2, 4], [4, 6], [6, 8]]);
    const ops = selectDeleteOps(seq, [{ startSec: 2, endSec: 4 }, { startSec: 6, endSec: 8 }]);
    expect(ops).toEqual([
      { type: 'rippleDelete', trackType: 'video', trackIndex: 0, clipIndex: 3 },
      { type: 'rippleDelete', trackType: 'video', trackIndex: 0, clipIndex: 1 },
    ]);
  });
  it('does not select clips that only partially overlap a range', () => {
    const seq = seqWithClips([[0, 3], [3, 8]]);
    expect(selectDeleteOps(seq, [{ startSec: 2, endSec: 4 }])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure** — FAIL.

- [ ] **Step 3: Implement**

`panel/src/silence/compile.ts`:

```ts
import type { Operation } from '../operations/schema';
import type { SequenceInfo, TrackInfo } from '../operations/model';
import type { TimeRange } from './detect';

const EPS = 0.001;

export function razorTimesForRanges(ranges: TimeRange[]): number[] {
  const set = new Set<number>();
  for (const r of ranges) { set.add(r.startSec); set.add(r.endSec); }
  return [...set].sort((a, b) => a - b);
}

export function compileRazorOps(times: number[]): Operation[] {
  return times.map((t) => ({ type: 'razorAll', timeSec: t }));
}

function primaryTrack(seq: SequenceInfo): { trackType: 'video' | 'audio'; track: TrackInfo } | null {
  const v = seq.videoTracks.find((t) => t.clips.length > 0);
  if (v) return { trackType: 'video', track: v };
  const a = seq.audioTracks.find((t) => t.clips.length > 0);
  return a ? { trackType: 'audio', track: a } : null;
}

export function selectDeleteOps(seq: SequenceInfo, ranges: TimeRange[]): Operation[] {
  const primary = primaryTrack(seq);
  if (!primary) return [];
  const inside = primary.track.clips.filter((c) =>
    ranges.some((r) => c.startSec >= r.startSec - EPS && c.endSec <= r.endSec + EPS)
  );
  return inside
    .sort((a, b) => b.startSec - a.startSec)
    .map((c) => ({
      type: 'rippleDelete' as const,
      trackType: primary.trackType,
      trackIndex: primary.track.index,
      clipIndex: c.index,
    }));
}
```

- [ ] **Step 4: Run tests** — Expected: PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: silence-removal razor and ripple-delete compilers"`

---

### Task 7: Director domain types and utterance preprocessing

**Files:**
- Create: `panel/src/director/types.ts`, `panel/src/director/preprocess.ts`
- Test: `panel/src/director/preprocess.test.ts`

**Interfaces:**
- Produces:

```ts
// types.ts
export interface Utterance { startSec: number; endSec: number; speakerId: string; text: string; }
export interface CameraMap { speakerToTrack: Record<string, number | null>; wideTrackIndex: number | null; }
export interface DirectorConfig { speakThresholdSec: number; minShotSec: number; gapBridgeSec: number; crosstalkMinSec: number; }
export const DEFAULT_DIRECTOR_CONFIG: DirectorConfig; // { speakThresholdSec: 1.0, minShotSec: 1.0, gapBridgeSec: 0.3, crosstalkMinSec: 1.5 }
export interface SwitchPoint { timeSec: number; toTrackIndex: number; reason: string; }

// preprocess.ts
export function mergeUtterances(utts: Utterance[], gapBridgeSec: number): Utterance[];
// sorts by start; joins consecutive same-speaker utterances whose gap < gapBridgeSec
// (this is what makes the 1s threshold a "look-ahead": a speaker's continuing speech
// accumulates into one utterance whose duration is judged once)
```

- [ ] **Step 1: Write failing tests**

`panel/src/director/preprocess.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mergeUtterances } from './preprocess';

const u = (startSec: number, endSec: number, speakerId: string, text = 'x') => ({ startSec, endSec, speakerId, text });

describe('mergeUtterances', () => {
  it('bridges small same-speaker gaps', () => {
    const out = mergeUtterances([u(0, 0.5, 'A', 'hi'), u(0.7, 1.6, 'A', 'there')], 0.3);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ startSec: 0, endSec: 1.6, speakerId: 'A', text: 'hi there' });
  });
  it('does not bridge across speakers or large gaps', () => {
    expect(mergeUtterances([u(0, 0.5, 'A'), u(0.6, 1, 'B')], 0.3)).toHaveLength(2);
    expect(mergeUtterances([u(0, 0.5, 'A'), u(1.5, 2, 'A')], 0.3)).toHaveLength(2);
  });
  it('sorts unsorted input', () => {
    const out = mergeUtterances([u(5, 6, 'B'), u(0, 1, 'A')], 0.3);
    expect(out[0]!.speakerId).toBe('A');
  });
});
```

- [ ] **Step 2: Run to verify failure** — FAIL.

- [ ] **Step 3: Implement**

`panel/src/director/types.ts`: exactly the Interfaces block above, plus:

```ts
export const DEFAULT_DIRECTOR_CONFIG: DirectorConfig = {
  speakThresholdSec: 1.0, minShotSec: 1.0, gapBridgeSec: 0.3, crosstalkMinSec: 1.5,
};
```

`panel/src/director/preprocess.ts`:

```ts
import type { Utterance } from './types';

export function mergeUtterances(utts: Utterance[], gapBridgeSec: number): Utterance[] {
  const sorted = [...utts].sort((a, b) => a.startSec - b.startSec);
  const out: Utterance[] = [];
  for (const cur of sorted) {
    const last = out[out.length - 1];
    if (last && last.speakerId === cur.speakerId && cur.startSec - last.endSec < gapBridgeSec) {
      last.endSec = Math.max(last.endSec, cur.endSec);
      last.text = `${last.text} ${cur.text}`.trim();
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run tests** — Expected: PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: director domain types and utterance gap-bridging"`

---

### Task 8: Director rule engine

**Files:**
- Create: `panel/src/director/engine.ts`
- Test: `panel/src/director/engine.test.ts`

**Interfaces:**
- Consumes: `Utterance`, `CameraMap`, `DirectorConfig`, `SwitchPoint` (Task 7). Input utterances are assumed already merged via `mergeUtterances`.
- Produces:

```ts
export function findCrosstalk(utts: Utterance[], map: CameraMap, minOverlapSec: number): TimeRange[];
export function planSwitches(utts: Utterance[], map: CameraMap, cfg: DirectorConfig, initialTrackIndex: number): SwitchPoint[];
```

Rules implemented (from the spec §6): 1s duration threshold via merged-utterance duration; off-camera hold (unmapped speaker never triggers a switch — this also covers the interrupt rule, since a sub-threshold interrupter is skipped); minimum 1s between switches (a switch that can't happen before the utterance ends is dropped); crosstalk → wide shot when a wide track exists; without a wide track, min-spacing naturally caps alternation at 1/sec.

- [ ] **Step 1: Write failing tests**

`panel/src/director/engine.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_DIRECTOR_CONFIG as CFG } from './types';
import { findCrosstalk, planSwitches } from './engine';

const u = (startSec: number, endSec: number, speakerId: string) => ({ startSec, endSec, speakerId, text: '' });
const MAP = { speakerToTrack: { A: 0, B: 1, C: null } as Record<string, number | null>, wideTrackIndex: null };

describe('planSwitches', () => {
  it('switches to a speaker who talks past the threshold', () => {
    const sw = planSwitches([u(0, 3, 'A'), u(3.2, 6, 'B')], MAP, CFG, 0);
    expect(sw).toEqual([{ timeSec: 3.2, toTrackIndex: 1, reason: expect.any(String) }]);
  });
  it('ignores brief remarks (< threshold)', () => {
    const sw = planSwitches([u(0, 3, 'A'), u(3.0, 3.5, 'B'), u(3.6, 7, 'A')], MAP, CFG, 0);
    expect(sw).toEqual([]);
  });
  it('holds when an off-camera speaker talks, regardless of duration', () => {
    const sw = planSwitches([u(0, 3, 'A'), u(3, 8, 'C')], MAP, CFG, 0);
    expect(sw).toEqual([]);
  });
  it('interrupt: holds on A unless B exceeds threshold', () => {
    // B interrupts A mid-utterance but only for 0.8s
    expect(planSwitches([u(0, 4, 'A'), u(2, 2.8, 'B')], MAP, CFG, 0)).toEqual([]);
    // B interrupts and keeps going for 2s -> cut to B
    const sw = planSwitches([u(0, 4, 'A'), u(2, 4.5, 'B')], MAP, CFG, 0);
    expect(sw).toEqual([{ timeSec: 2, toTrackIndex: 1, reason: expect.any(String) }]);
  });
  it('enforces minimum spacing between switches', () => {
    const sw = planSwitches([u(0, 1.5, 'B'), u(0.5, 2.1, 'A')], MAP, CFG, 0);
    // switch to B at 0; switch back to A no earlier than 1.0
    expect(sw[0]).toMatchObject({ timeSec: 0, toTrackIndex: 1 });
    expect(sw[1]!.timeSec).toBeGreaterThanOrEqual(1.0);
  });
  it('drops a switch whose legal time falls after the utterance ends', () => {
    const sw = planSwitches([u(0, 2, 'B'), u(0.5, 1.4, 'A')], MAP, CFG, 0);
    // A's window [1.0(spacing)..1.4) is fine, but A is only 0.9s -> under threshold anyway
    expect(sw).toHaveLength(1);
  });
  it('cuts to the wide shot during sustained crosstalk when a wide track exists', () => {
    const wide = { ...MAP, wideTrackIndex: 5 };
    const sw = planSwitches([u(0, 6, 'A'), u(2, 6, 'B')], wide, CFG, 0);
    expect(sw.some((s) => s.toTrackIndex === 5)).toBe(true);
  });
});

describe('findCrosstalk', () => {
  it('finds overlaps of two mapped speakers longer than the minimum', () => {
    const r = findCrosstalk([u(0, 6, 'A'), u(2, 6, 'B')], MAP, 1.5);
    expect(r).toEqual([{ startSec: 2, endSec: 6 }]);
  });
  it('ignores overlaps involving unmapped speakers or short overlaps', () => {
    expect(findCrosstalk([u(0, 6, 'A'), u(2, 6, 'C')], MAP, 1.5)).toEqual([]);
    expect(findCrosstalk([u(0, 3, 'A'), u(2.5, 6, 'B')], MAP, 1.5)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure** — FAIL.

- [ ] **Step 3: Implement**

`panel/src/director/engine.ts`:

```ts
import type { TimeRange } from '../silence/detect';
import type { CameraMap, DirectorConfig, SwitchPoint, Utterance } from './types';

export function findCrosstalk(utts: Utterance[], map: CameraMap, minOverlapSec: number): TimeRange[] {
  const mapped = utts.filter((u) => map.speakerToTrack[u.speakerId] != null);
  const out: TimeRange[] = [];
  for (let i = 0; i < mapped.length; i++) {
    for (let j = i + 1; j < mapped.length; j++) {
      const a = mapped[i]!, b = mapped[j]!;
      if (a.speakerId === b.speakerId) continue;
      const s = Math.max(a.startSec, b.startSec);
      const e = Math.min(a.endSec, b.endSec);
      if (e - s >= minOverlapSec) out.push({ startSec: s, endSec: e });
    }
  }
  // merge overlapping crosstalk windows
  out.sort((x, y) => x.startSec - y.startSec);
  const merged: TimeRange[] = [];
  for (const r of out) {
    const last = merged[merged.length - 1];
    if (last && r.startSec <= last.endSec) last.endSec = Math.max(last.endSec, r.endSec);
    else merged.push({ ...r });
  }
  return merged;
}

export function planSwitches(
  utts: Utterance[], map: CameraMap, cfg: DirectorConfig, initialTrackIndex: number,
): SwitchPoint[] {
  const sorted = [...utts].sort((a, b) => a.startSec - b.startSec);
  const crosstalk = map.wideTrackIndex != null ? findCrosstalk(sorted, map, cfg.crosstalkMinSec) : [];
  const inCrosstalk = (t: number) => crosstalk.some((r) => t >= r.startSec && t < r.endSec);

  const switches: SwitchPoint[] = [];
  let current = initialTrackIndex;
  let lastSwitch = -Infinity;

  const trySwitch = (time: number, track: number, deadline: number, reason: string): void => {
    if (track === current) return;
    const t = Math.max(time, lastSwitch + cfg.minShotSec);
    if (t >= deadline) return; // couldn't legally cut before the moment passed
    switches.push({ timeSec: t, toTrackIndex: track, reason });
    current = track;
    lastSwitch = t;
  };

  // wide-shot cuts for sustained crosstalk
  for (const r of crosstalk) {
    trySwitch(r.startSec, map.wideTrackIndex!, r.endSec, 'crosstalk → wide shot');
  }

  for (const u of sorted) {
    const track = map.speakerToTrack[u.speakerId] ?? null;
    if (track == null) continue; // off-camera hold
    if (u.endSec - u.startSec < cfg.speakThresholdSec) continue; // brief remark / weak interrupt
    if (inCrosstalk(u.startSec)) continue; // wide shot owns this moment
    trySwitch(u.startSec, track, u.endSec, `${u.speakerId} speaks ${(u.endSec - u.startSec).toFixed(1)}s`);
  }

  return switches.sort((a, b) => a.timeSec - b.timeSec);
}
```

Note: `trySwitch` mutates `current`/`lastSwitch` in call order; crosstalk windows are processed first, then utterances chronologically. If the interleaving produces out-of-order switch times, the final sort keeps output stable; the engine test suite is the contract — extend it before changing behavior.

- [ ] **Step 4: Run tests** — Expected: PASS. If the crosstalk-before-utterance interleaving breaks a test, fix the implementation (e.g., process events in a single time-ordered walk) rather than weakening tests.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: camera-director rule engine with threshold, hold, spacing, crosstalk rules"`

---

### Task 9: Switch-point → segment → operation compiler

**Files:**
- Create: `panel/src/director/compile.ts`
- Test: `panel/src/director/compile.test.ts`

**Interfaces:**
- Consumes: `SwitchPoint` (Task 7), `SequenceInfo` (Task 3), `Operation` (Task 3), `compileRazorOps` (Task 6).
- Produces:

```ts
export interface Segment { startSec: number; endSec: number; activeTrackIndex: number; }
export function switchesToSegments(switches: SwitchPoint[], startSec: number, endSec: number, initialTrackIndex: number): Segment[];
export function compileEnableOps(seq: SequenceInfo, segments: Segment[], cameraTrackIndices: number[]): Operation[];
// For each camera track and each of its clips (post-razor), the clip is enabled iff the
// segment containing the clip's midpoint has activeTrackIndex === that track's index.
// Only emits ops that CHANGE state (skip already-correct clips).
```

- [ ] **Step 1: Write failing tests**

`panel/src/director/compile.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { SequenceInfo } from '../operations/model';
import { compileEnableOps, switchesToSegments } from './compile';

function seq(tracks: Array<{ index: number; clips: Array<[number, number, boolean]> }>): SequenceInfo {
  return {
    name: 's', endSec: 10, fps: 30, audioTracks: [],
    videoTracks: tracks.map((t) => ({
      index: t.index, name: `V${t.index + 1}`,
      clips: t.clips.map(([s, e, en], i) => ({ index: i, nodeId: `t${t.index}c${i}`, name: '', startSec: s, endSec: e, enabled: en })),
    })),
  };
}

describe('switchesToSegments', () => {
  it('builds contiguous segments from switches', () => {
    const segs = switchesToSegments(
      [{ timeSec: 3, toTrackIndex: 1, reason: '' }, { timeSec: 7, toTrackIndex: 0, reason: '' }], 0, 10, 0);
    expect(segs).toEqual([
      { startSec: 0, endSec: 3, activeTrackIndex: 0 },
      { startSec: 3, endSec: 7, activeTrackIndex: 1 },
      { startSec: 7, endSec: 10, activeTrackIndex: 0 },
    ]);
  });
});

describe('compileEnableOps', () => {
  it('enables only the active camera per segment, emitting only changes', () => {
    // both tracks razored at 3; all clips currently enabled
    const s = seq([
      { index: 0, clips: [[0, 3, true], [3, 10, true]] },
      { index: 1, clips: [[0, 3, true], [3, 10, true]] },
    ]);
    const ops = compileEnableOps(s, [
      { startSec: 0, endSec: 3, activeTrackIndex: 0 },
      { startSec: 3, endSec: 10, activeTrackIndex: 1 },
    ], [0, 1]);
    expect(ops).toEqual([
      { type: 'setClipEnabled', trackType: 'video', trackIndex: 0, clipIndex: 1, enabled: false },
      { type: 'setClipEnabled', trackType: 'video', trackIndex: 1, clipIndex: 0, enabled: false },
    ]);
  });
  it('ignores tracks not in cameraTrackIndices', () => {
    const s = seq([{ index: 0, clips: [[0, 10, true]] }, { index: 2, clips: [[0, 10, true]] }]);
    const ops = compileEnableOps(s, [{ startSec: 0, endSec: 10, activeTrackIndex: 0 }], [0]);
    expect(ops).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure** — FAIL.

- [ ] **Step 3: Implement**

`panel/src/director/compile.ts`:

```ts
import type { Operation } from '../operations/schema';
import type { SequenceInfo } from '../operations/model';
import type { SwitchPoint } from './types';

export interface Segment { startSec: number; endSec: number; activeTrackIndex: number; }

export function switchesToSegments(
  switches: SwitchPoint[], startSec: number, endSec: number, initialTrackIndex: number,
): Segment[] {
  const sorted = [...switches].sort((a, b) => a.timeSec - b.timeSec);
  const segs: Segment[] = [];
  let cursor = startSec;
  let active = initialTrackIndex;
  for (const sw of sorted) {
    if (sw.timeSec > cursor) segs.push({ startSec: cursor, endSec: sw.timeSec, activeTrackIndex: active });
    cursor = sw.timeSec;
    active = sw.toTrackIndex;
  }
  if (cursor < endSec) segs.push({ startSec: cursor, endSec, activeTrackIndex: active });
  return segs;
}

export function compileEnableOps(
  seq: SequenceInfo, segments: Segment[], cameraTrackIndices: number[],
): Operation[] {
  const ops: Operation[] = [];
  for (const track of seq.videoTracks) {
    if (!cameraTrackIndices.includes(track.index)) continue;
    for (const clip of track.clips) {
      const mid = (clip.startSec + clip.endSec) / 2;
      const seg = segments.find((s) => mid >= s.startSec && mid < s.endSec);
      if (!seg) continue;
      const shouldEnable = seg.activeTrackIndex === track.index;
      if (clip.enabled !== shouldEnable) {
        ops.push({ type: 'setClipEnabled', trackType: 'video', trackIndex: track.index, clipIndex: clip.index, enabled: shouldEnable });
      }
    }
  }
  return ops;
}
```

- [ ] **Step 4: Run tests** — Expected: PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: switch-point segmentation and enable/disable op compiler"`

---

### Task 10: ExtendScript host bridge

**Files:**
- Modify: `host/json2.jsx` (replace placeholder), `host/index.jsx` (replace placeholder)

**Interfaces:**
- Produces ExtendScript globals callable via `evalScript` (all return JSON strings):
  - `PD_ping()` → `"pong"`
  - `PD_getSequenceInfo()` → `SequenceInfo` shape from Task 3 (adds nothing, omits nothing) or `{error}`
  - `PD_exportAudio(outPath, presetPath)` → `{ok:true,path}` or `{ok:false,error}`
  - `PD_execute(batchJson)` → `{ok:boolean, applied:number, failedAt?:number, error?:string}`
- ES3 only. No unit tests — verified via the smoke checklist below and Task 18's integration checklist.

- [ ] **Step 1: Replace `host/json2.jsx`** with Douglas Crockford's public-domain json2.js (fetch from https://raw.githubusercontent.com/douglascrockford/JSON-js/master/json2.js and save verbatim; keep the public-domain header). Wrap nothing — it already guards with `typeof JSON`.

Run: `curl -fsSL https://raw.githubusercontent.com/douglascrockford/JSON-js/master/json2.js -o host/json2.jsx`

- [ ] **Step 2: Write `host/index.jsx`**

```js
// Premiere Director — ExtendScript host bridge (ES3).
// All entry points return JSON strings. Mutations arrive only as validated operation batches.

function PD_ping() { return 'pong'; }

function _pdActiveSequence() {
  if (!app.project || !app.project.activeSequence) return null;
  return app.project.activeSequence;
}

function _pdFps(seq) {
  // videoFrameRate is a Time object holding one frame's duration.
  var frameSec = seq.getSettings().videoFrameRate.seconds;
  return frameSec > 0 ? 1 / frameSec : 30;
}

function _pdTrackInfo(track, index) {
  var clips = [];
  for (var i = 0; i < track.clips.numItems; i++) {
    var c = track.clips[i];
    clips.push({
      index: i,
      nodeId: c.nodeId || String(i),
      name: c.name || '',
      startSec: c.start.seconds,
      endSec: c.end.seconds,
      enabled: !c.disabled
    });
  }
  return { index: index, name: track.name || '', clips: clips };
}

function PD_getSequenceInfo() {
  try {
    var seq = _pdActiveSequence();
    if (!seq) return JSON.stringify({ error: 'No active sequence' });
    var v = [], a = [], i;
    for (i = 0; i < seq.videoTracks.numTracks; i++) v.push(_pdTrackInfo(seq.videoTracks[i], i));
    for (i = 0; i < seq.audioTracks.numTracks; i++) a.push(_pdTrackInfo(seq.audioTracks[i], i));
    return JSON.stringify({
      name: seq.name,
      endSec: seq.end ? Number(seq.end) / 254016000000 : 0,
      fps: _pdFps(seq),
      videoTracks: v,
      audioTracks: a
    });
  } catch (e) {
    return JSON.stringify({ error: 'getSequenceInfo: ' + e.toString() });
  }
}

function PD_exportAudio(outPath, presetPath) {
  try {
    var seq = _pdActiveSequence();
    if (!seq) return JSON.stringify({ ok: false, error: 'No active sequence' });
    // Synchronous render inside Premiere; 0 = ENCODE_ENTIRE.
    var res = seq.exportAsMediaDirect(outPath, presetPath, app.encoder.ENCODE_ENTIRE);
    var f = new File(outPath);
    if (!f.exists) return JSON.stringify({ ok: false, error: 'export produced no file: ' + res });
    return JSON.stringify({ ok: true, path: outPath });
  } catch (e) {
    return JSON.stringify({ ok: false, error: 'exportAudio: ' + e.toString() });
  }
}

function _pdSmpte(sec, fps) {
  var totalFrames = Math.round(sec * fps);
  var fpsInt = Math.round(fps);
  var ff = totalFrames % fpsInt;
  var totalSec = Math.floor(totalFrames / fpsInt);
  var ss = totalSec % 60;
  var mm = Math.floor(totalSec / 60) % 60;
  var hh = Math.floor(totalSec / 3600);
  function p(n) { return (n < 10 ? '0' : '') + n; }
  return p(hh) + ':' + p(mm) + ':' + p(ss) + ':' + p(ff);
}

function _pdRazorAll(timeSec) {
  app.enableQE();
  var seq = _pdActiveSequence();
  var qseq = qe.project.getActiveSequence();
  var tc = _pdSmpte(timeSec, _pdFps(seq));
  var i;
  for (i = 0; i < seq.videoTracks.numTracks; i++) {
    if (seq.videoTracks[i].clips.numItems > 0) qseq.getVideoTrackAt(i).razor(tc);
  }
  for (i = 0; i < seq.audioTracks.numTracks; i++) {
    if (seq.audioTracks[i].clips.numItems > 0) qseq.getAudioTrackAt(i).razor(tc);
  }
}

function _pdGetClip(trackType, trackIndex, clipIndex) {
  var seq = _pdActiveSequence();
  var tracks = trackType === 'video' ? seq.videoTracks : seq.audioTracks;
  if (trackIndex >= tracks.numTracks) throw new Error('track ' + trackIndex + ' out of range');
  var track = tracks[trackIndex];
  if (clipIndex >= track.clips.numItems) throw new Error('clip ' + clipIndex + ' out of range');
  return track.clips[clipIndex];
}

function PD_execute(batchJson) {
  var applied = 0;
  try {
    var batch = JSON.parse(batchJson);
    if (!batch || !batch.ops || !batch.ops.length) return JSON.stringify({ ok: true, applied: 0 });
    for (var i = 0; i < batch.ops.length; i++) {
      var op = batch.ops[i];
      try {
        if (op.type === 'razorAll') {
          _pdRazorAll(op.timeSec);
        } else if (op.type === 'rippleDelete') {
          _pdGetClip(op.trackType, op.trackIndex, op.clipIndex).remove(1, 1);
        } else if (op.type === 'setClipEnabled') {
          _pdGetClip(op.trackType, op.trackIndex, op.clipIndex).disabled = !op.enabled;
        } else {
          throw new Error('unknown op type ' + op.type);
        }
        applied++;
      } catch (opErr) {
        return JSON.stringify({ ok: false, applied: applied, failedAt: i, error: opErr.toString() });
      }
    }
    return JSON.stringify({ ok: true, applied: applied });
  } catch (e) {
    return JSON.stringify({ ok: false, applied: applied, error: 'execute: ' + e.toString() });
  }
}
```

- [ ] **Step 3: Build and smoke-test in Premiere** (requires the machine's Premiere Pro 2026)

Run: `npm run build && ./scripts/dev-install.sh`
Then in Premiere: open any project with a sequence, Window > Extensions > Premiere Director. Open Chrome at `http://localhost:7002` (CEP remote debugger), select the panel, and in its console run:

```js
const cs = new CSInterface(); // available after Task 11 wiring; before that, use window.__adobe_cep__.evalScript
window.__adobe_cep__.evalScript('PD_ping()', (r) => console.log('ping:', r));
window.__adobe_cep__.evalScript('PD_getSequenceInfo()', (r) => console.log(JSON.parse(r)));
```

Expected: `ping: pong` and a sequence-info object listing real tracks/clips. Known risk flagged for the executor: QE `razor` timecode format may need `;` separators on drop-frame sequences — if razor lands on the wrong frame in the Task 18 checklist, switch `_pdSmpte` to use the sequence's `videoDisplayFormat` and adjust.

- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: ExtendScript host bridge with sequence read, audio export, batch executor"`

---

### Task 11: HostAdapter seam and CEP adapter

**Files:**
- Create: `panel/src/vendor/CSInterface.js` (vendored from Adobe-CEP/CEP-Resources, CEP 12 branch — download https://raw.githubusercontent.com/Adobe-CEP/CEP-Resources/master/CEP_12.x/CSInterface.js, keep Adobe's license header), `panel/src/vendor/CSInterface.d.ts`
- Create: `panel/src/adapters/HostAdapter.ts`, `panel/src/adapters/CepAdapter.ts`
- Test: `panel/src/adapters/CepAdapter.test.ts`

**Interfaces:**
- Consumes: `SequenceInfo` (Task 3), `OperationBatch`/`validateBatch` (Task 3), `structureHash` (Task 2).
- Produces:

```ts
// HostAdapter.ts
export interface ApplyResult { ok: boolean; applied: number; failedAt?: number; error?: string; }
export interface HostAdapter {
  ping(): Promise<boolean>;
  getSequenceInfo(): Promise<SequenceInfo>;               // throws Error on {error} responses
  exportAudio(outPath: string, presetPath: string): Promise<string>; // resolves to path
  applyOperations(batch: OperationBatch, expectedHash?: string): Promise<ApplyResult>;
  // applyOperations validates the batch, and when expectedHash is given it refetches
  // sequence info first and aborts with {ok:false, error:'sequence changed...'} on mismatch.
}

// CepAdapter.ts
export type EvalScriptFn = (script: string, cb: (result: string) => void) => void;
export class CepAdapter implements HostAdapter {
  constructor(evalScript?: EvalScriptFn); // default: real CSInterface().evalScript
}
export function sequenceHash(info: SequenceInfo): string; // structureHash over tracks/clips only
```

- [ ] **Step 1: Vendor CSInterface**

Run: `mkdir -p panel/src/vendor && curl -fsSL https://raw.githubusercontent.com/Adobe-CEP/CEP-Resources/master/CEP_12.x/CSInterface.js -o panel/src/vendor/CSInterface.js`

`panel/src/vendor/CSInterface.d.ts`:

```ts
export class CSInterface {
  evalScript(script: string, callback: (result: string) => void): void;
  getSystemPath(pathType: string): string;
}
export const SystemPath: { EXTENSION: string; USER_DATA: string };
```

(If the downloaded file is not an ES module, add `export` shims at the bottom: `export { CSInterface, SystemPath };` — verify by importing it in a test.)

- [ ] **Step 2: Write failing tests**

`panel/src/adapters/CepAdapter.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { SequenceInfo } from '../operations/model';
import { CepAdapter, sequenceHash } from './CepAdapter';

const SEQ: SequenceInfo = {
  name: 's', endSec: 10, fps: 30,
  videoTracks: [{ index: 0, name: 'V1', clips: [{ index: 0, nodeId: 'a', name: '', startSec: 0, endSec: 10, enabled: true }] }],
  audioTracks: [],
};

function fakeEval(responses: Record<string, string>) {
  const calls: string[] = [];
  const fn = (script: string, cb: (r: string) => void) => {
    calls.push(script);
    const key = Object.keys(responses).find((k) => script.startsWith(k));
    cb(key ? responses[key]! : 'EvalScript error.');
  };
  return { fn, calls };
}

describe('CepAdapter', () => {
  it('parses sequence info', async () => {
    const { fn } = fakeEval({ PD_getSequenceInfo: JSON.stringify(SEQ) });
    const a = new CepAdapter(fn);
    expect((await a.getSequenceInfo()).name).toBe('s');
  });
  it('throws on host error payloads and EvalScript errors', async () => {
    const { fn } = fakeEval({ PD_getSequenceInfo: JSON.stringify({ error: 'No active sequence' }) });
    await expect(new CepAdapter(fn).getSequenceInfo()).rejects.toThrow(/no active sequence/i);
    const bad = fakeEval({});
    await expect(new CepAdapter(bad.fn).getSequenceInfo()).rejects.toThrow(/evalscript/i);
  });
  it('rejects invalid batches before touching the host', async () => {
    const { fn, calls } = fakeEval({});
    const r = await new CepAdapter(fn).applyOperations({ ops: [{ type: 'nope' } as never] });
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
  it('aborts apply when the sequence hash changed', async () => {
    const { fn, calls } = fakeEval({ PD_getSequenceInfo: JSON.stringify(SEQ) });
    const r = await new CepAdapter(fn).applyOperations({ ops: [{ type: 'razorAll', timeSec: 1 }] }, 'stale-hash');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/changed/i);
    expect(calls.some((c) => c.startsWith('PD_execute'))).toBe(false);
  });
  it('executes valid batches with matching hash', async () => {
    const { fn } = fakeEval({
      PD_getSequenceInfo: JSON.stringify(SEQ),
      PD_execute: JSON.stringify({ ok: true, applied: 1 }),
    });
    const r = await new CepAdapter(fn).applyOperations({ ops: [{ type: 'razorAll', timeSec: 1 }] }, sequenceHash(SEQ));
    expect(r).toEqual({ ok: true, applied: 1 });
  });
});
```

- [ ] **Step 3: Run to verify failure** — FAIL.

- [ ] **Step 4: Implement**

`panel/src/adapters/HostAdapter.ts`: the interface block from Interfaces above, verbatim.

`panel/src/adapters/CepAdapter.ts`:

```ts
import type { SequenceInfo } from '../operations/model';
import { validateBatch, type OperationBatch } from '../operations/schema';
import { structureHash } from '../lib/hash';
import type { ApplyResult, HostAdapter } from './HostAdapter';

export type EvalScriptFn = (script: string, cb: (result: string) => void) => void;

function defaultEvalScript(): EvalScriptFn {
  // Lazy so tests never touch CEP. __adobe_cep__ exists only inside a CEP host.
  const cep = (window as unknown as { __adobe_cep__?: { evalScript: EvalScriptFn } }).__adobe_cep__;
  if (!cep) throw new Error('Not running inside a CEP host');
  return cep.evalScript.bind(cep);
}

export function sequenceHash(info: SequenceInfo): string {
  return structureHash({ v: info.videoTracks, a: info.audioTracks });
}

export class CepAdapter implements HostAdapter {
  private readonly evalScript: EvalScriptFn;

  constructor(evalScript?: EvalScriptFn) {
    this.evalScript = evalScript ?? defaultEvalScript();
  }

  private call(script: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.evalScript(script, (result) => {
        if (typeof result === 'string' && result.indexOf('EvalScript error') !== -1) {
          reject(new Error(`EvalScript failed for: ${script.slice(0, 60)}`));
        } else resolve(result);
      });
    });
  }

  async ping(): Promise<boolean> {
    try { return (await this.call('PD_ping()')) === 'pong'; } catch { return false; }
  }

  async getSequenceInfo(): Promise<SequenceInfo> {
    const raw = await this.call('PD_getSequenceInfo()');
    const parsed = JSON.parse(raw) as SequenceInfo | { error: string };
    if ('error' in parsed) throw new Error(parsed.error);
    return parsed;
  }

  async exportAudio(outPath: string, presetPath: string): Promise<string> {
    const raw = await this.call(`PD_exportAudio(${JSON.stringify(outPath)}, ${JSON.stringify(presetPath)})`);
    const parsed = JSON.parse(raw) as { ok: boolean; path?: string; error?: string };
    if (!parsed.ok || !parsed.path) throw new Error(parsed.error ?? 'audio export failed');
    return parsed.path;
  }

  async applyOperations(batch: OperationBatch, expectedHash?: string): Promise<ApplyResult> {
    const valid = validateBatch(batch);
    if (!valid.ok) return { ok: false, applied: 0, error: `invalid batch: ${valid.errors.join('; ')}` };
    if (expectedHash) {
      const current = sequenceHash(await this.getSequenceInfo());
      if (current !== expectedHash) {
        return { ok: false, applied: 0, error: 'sequence changed since analysis — re-run analysis before applying' };
      }
    }
    const payload = JSON.stringify(JSON.stringify(valid.batch)); // double-encode: JS string literal containing JSON
    const raw = await this.call(`PD_execute(${payload})`);
    return JSON.parse(raw) as ApplyResult;
  }
}
```

- [ ] **Step 5: Run tests** — Expected: PASS.
- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: HostAdapter seam with CEP evalScript adapter and staleness guard"`

---

### Task 12: Tool runner, model downloads, whisper.cpp transcription provider

**Files:**
- Create: `panel/src/asr/run.ts` (spawn wrapper), `panel/src/asr/whisper.ts`, `panel/src/asr/download.ts`
- Create: `providers/README.md` placeholder note (full docs Task 17)
- Test: `panel/src/asr/whisper.test.ts`

**Interfaces:**
- Consumes: `Utterance` (Task 7).
- Produces:

```ts
// run.ts
export interface RunResult { exitCode: number; stdout: string; stderr: string; }
export type Runner = (bin: string, args: string[]) => Promise<RunResult>;
export const nodeRunner: Runner; // child_process.execFile wrapper, 30-min timeout

// whisper.ts
export interface WhisperConfig { binPath: string; modelPath: string; }
export function parseWhisperJson(jsonText: string): Utterance[]; // speakerId 'speaker_?' for all
export async function transcribe(wavPath: string, cfg: WhisperConfig, deps: { run: Runner; readFile: (p: string) => Promise<string>; tmpDir: string }): Promise<Utterance[]>;

// download.ts
export const WHISPER_MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin';
export async function downloadFile(url: string, destPath: string, onProgress?: (pct: number) => void): Promise<void>; // Node https, follows redirects
```

- [ ] **Step 1: Write failing test** (parsing only — spawning is integration-tested)

`panel/src/asr/whisper.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify failure** — FAIL.

- [ ] **Step 3: Implement**

`panel/src/asr/run.ts`:

```ts
import { execFile } from 'child_process';

export interface RunResult { exitCode: number; stdout: string; stderr: string; }
export type Runner = (bin: string, args: string[]) => Promise<RunResult>;

export const nodeRunner: Runner = (bin, args) =>
  new Promise((resolve) => {
    execFile(bin, args, { timeout: 30 * 60 * 1000, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      const code = err && typeof (err as NodeJS.ErrnoException & { code?: number }).code === 'number'
        ? ((err as unknown as { code: number }).code)
        : err ? 1 : 0;
      resolve({ exitCode: code, stdout: String(stdout), stderr: String(stderr) });
    });
  });
```

`panel/src/asr/whisper.ts`:

```ts
import type { Utterance } from '../director/types';
import type { Runner } from './run';

export interface WhisperConfig { binPath: string; modelPath: string; }

interface WhisperSegment { offsets: { from: number; to: number }; text: string; }

export function parseWhisperJson(jsonText: string): Utterance[] {
  const parsed = JSON.parse(jsonText) as { transcription?: WhisperSegment[] };
  if (!Array.isArray(parsed.transcription)) throw new Error('whisper output missing "transcription" array');
  return parsed.transcription.map((s) => ({
    startSec: s.offsets.from / 1000,
    endSec: s.offsets.to / 1000,
    speakerId: 'speaker_?',
    text: s.text.trim(),
  }));
}

export async function transcribe(
  wavPath: string,
  cfg: WhisperConfig,
  deps: { run: Runner; readFile: (p: string) => Promise<string>; tmpDir: string },
): Promise<Utterance[]> {
  const outBase = `${deps.tmpDir}/pd-whisper-${Date.now()}`;
  const args = ['-m', cfg.modelPath, '-f', wavPath, '-oj', '-of', outBase];
  const res = await deps.run(cfg.binPath, args);
  if (res.exitCode !== 0) throw new Error(`whisper failed (${res.exitCode}): ${res.stderr.slice(-500)}`);
  return parseWhisperJson(await deps.readFile(`${outBase}.json`));
}
```

`panel/src/asr/download.ts`:

```ts
import { createWriteStream } from 'fs';
import { get } from 'https';

export const WHISPER_MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin';

export function downloadFile(url: string, destPath: string, onProgress?: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadFile(res.headers.location, destPath, onProgress).then(resolve, reject);
        res.resume();
        return;
      }
      if (res.statusCode !== 200) { reject(new Error(`download HTTP ${res.statusCode} for ${url}`)); return; }
      const total = Number(res.headers['content-length'] ?? 0);
      let got = 0;
      const out = createWriteStream(destPath);
      res.on('data', (chunk: Buffer) => { got += chunk.length; if (total && onProgress) onProgress(Math.round((got / total) * 100)); });
      res.pipe(out);
      out.on('finish', () => out.close(() => resolve()));
      out.on('error', reject);
      res.on('error', reject);
    }).on('error', reject);
  });
}
```

`providers/README.md`:

```md
# Providers

Provider interfaces and adapters live here. See /docs/providers.md (Task 17/18) for the extension guide.
```

- [ ] **Step 4: Run tests** — Expected: PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: tool runner, model downloader, whisper.cpp transcription provider"`

---

### Task 13: Diarization provider and speaker assignment

**Files:**
- Create: `panel/src/asr/diarize.ts`
- Test: `panel/src/asr/diarize.test.ts`

**Interfaces:**
- Consumes: `Utterance` (Task 7), `Runner` (Task 12).
- Produces:

```ts
export interface DiarSegment { startSec: number; endSec: number; speakerId: string; }
export function parseDiarizationOutput(text: string): DiarSegment[];
// parses sherpa-onnx offline-speaker-diarization stdout lines: "0.031 -- 5.290 speaker_00"
export function assignSpeakers(utts: Utterance[], segs: DiarSegment[]): Utterance[];
// each utterance gets the speakerId with max time-overlap; no overlap -> keeps 'speaker_?'
export async function diarize(wavPath: string, cfg: { binPath: string; segModelPath: string; embModelPath: string }, run: Runner): Promise<DiarSegment[]>;
```

- [ ] **Step 1: Write failing tests**

`panel/src/asr/diarize.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { assignSpeakers, parseDiarizationOutput } from './diarize';

describe('parseDiarizationOutput', () => {
  it('parses segment lines and ignores noise lines', () => {
    const out = parseDiarizationOutput('loading model...\n0.031 -- 5.290 speaker_00\n5.400 -- 9.000 speaker_01\ndone\n');
    expect(out).toEqual([
      { startSec: 0.031, endSec: 5.29, speakerId: 'speaker_00' },
      { startSec: 5.4, endSec: 9, speakerId: 'speaker_01' },
    ]);
  });
});

describe('assignSpeakers', () => {
  const segs = [
    { startSec: 0, endSec: 5, speakerId: 'speaker_00' },
    { startSec: 5, endSec: 10, speakerId: 'speaker_01' },
  ];
  it('assigns by maximum overlap', () => {
    const utts = assignSpeakers([{ startSec: 4, endSec: 8, speakerId: 'speaker_?', text: 'hi' }], segs);
    expect(utts[0]!.speakerId).toBe('speaker_01'); // 3s overlap vs 1s
  });
  it('keeps speaker_? when nothing overlaps', () => {
    const utts = assignSpeakers([{ startSec: 20, endSec: 21, speakerId: 'speaker_?', text: 'hi' }], segs);
    expect(utts[0]!.speakerId).toBe('speaker_?');
  });
});
```

- [ ] **Step 2: Run to verify failure** — FAIL.

- [ ] **Step 3: Implement**

`panel/src/asr/diarize.ts`:

```ts
import type { Utterance } from '../director/types';
import type { Runner } from './run';

export interface DiarSegment { startSec: number; endSec: number; speakerId: string; }

const LINE = /^(\d+(?:\.\d+)?)\s*--\s*(\d+(?:\.\d+)?)\s+(\S+)\s*$/;

export function parseDiarizationOutput(text: string): DiarSegment[] {
  const out: DiarSegment[] = [];
  for (const line of text.split('\n')) {
    const m = LINE.exec(line.trim());
    if (m) out.push({ startSec: Number(m[1]), endSec: Number(m[2]), speakerId: m[3]! });
  }
  return out;
}

export function assignSpeakers(utts: Utterance[], segs: DiarSegment[]): Utterance[] {
  return utts.map((u) => {
    const overlapBySpeaker = new Map<string, number>();
    for (const s of segs) {
      const ov = Math.min(u.endSec, s.endSec) - Math.max(u.startSec, s.startSec);
      if (ov > 0) overlapBySpeaker.set(s.speakerId, (overlapBySpeaker.get(s.speakerId) ?? 0) + ov);
    }
    let best: string | null = null;
    let bestOv = 0;
    for (const [spk, ov] of overlapBySpeaker) if (ov > bestOv) { best = spk; bestOv = ov; }
    return best ? { ...u, speakerId: best } : u;
  });
}

export async function diarize(
  wavPath: string,
  cfg: { binPath: string; segModelPath: string; embModelPath: string },
  run: Runner,
): Promise<DiarSegment[]> {
  const res = await run(cfg.binPath, [
    `--segmentation-pyannote-model=${cfg.segModelPath}`,
    `--embedding-model=${cfg.embModelPath}`,
    wavPath,
  ]);
  if (res.exitCode !== 0) throw new Error(`diarization failed (${res.exitCode}): ${res.stderr.slice(-500)}`);
  const segs = parseDiarizationOutput(res.stdout || res.stderr);
  if (!segs.length) throw new Error('diarization produced no segments — check binary and model paths in Settings');
  return segs;
}
```

- [ ] **Step 4: Run tests** — Expected: PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: sherpa-onnx diarization parsing and overlap-based speaker assignment"`

---

### Task 14: Settings store and network audit log

**Files:**
- Create: `panel/src/lib/settings.ts`, `panel/src/audit/log.ts`
- Test: `panel/src/lib/settings.test.ts`, `panel/src/audit/log.test.ts`

**Interfaces:**
- Produces:

```ts
// settings.ts
export interface Settings {
  whisperBinPath: string; whisperModelPath: string;
  diarizeBinPath: string; diarizeSegModelPath: string; diarizeEmbModelPath: string;
  wavPresetPath: string;
  silence: SilenceConfig;          // from Task 5
  director: DirectorConfig;        // from Task 7
}
export function defaultSettings(): Settings; // all paths '', configs = DEFAULT_*
export interface KV { get(k: string): string | null; set(k: string, v: string): void; }
export function loadSettings(kv: KV): Settings;      // merges stored JSON over defaults
export function saveSettings(kv: KV, s: Settings): void;
export const localStorageKV: KV;

// audit/log.ts
export interface AuditEntry { ts: string; url: string; purpose: string; destFile?: string; }
export function formatAuditLine(e: AuditEntry): string;   // one JSONL line ending in \n
export function appendAudit(filePath: string, e: AuditEntry, appendFileSync?: (p: string, d: string) => void): void;
export function parseAuditLog(text: string): AuditEntry[];
```

- [ ] **Step 1: Write failing tests**

`panel/src/lib/settings.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { defaultSettings, loadSettings, saveSettings, type KV } from './settings';

function memKV(): KV & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return { store, get: (k) => store.get(k) ?? null, set: (k, v) => void store.set(k, v) };
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
```

`panel/src/audit/log.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { appendAudit, formatAuditLine, parseAuditLog } from './log';

describe('audit log', () => {
  const entry = { ts: '2026-07-08T12:00:00Z', url: 'https://huggingface.co/x', purpose: 'whisper model download' };
  it('formats JSONL and parses it back', () => {
    const line = formatAuditLine(entry);
    expect(line.endsWith('\n')).toBe(true);
    expect(parseAuditLog(line + formatAuditLine(entry))).toHaveLength(2);
  });
  it('appends via injected fs', () => {
    const writes: string[] = [];
    appendAudit('/tmp/audit.jsonl', entry, (_p, d) => void writes.push(d));
    expect(writes[0]).toContain('whisper model download');
  });
});
```

- [ ] **Step 2: Run to verify failure** — FAIL.

- [ ] **Step 3: Implement**

`panel/src/lib/settings.ts`:

```ts
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

export function loadSettings(kv: KV): Settings {
  const raw = kv.get(KEY);
  if (!raw) return defaultSettings();
  try {
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const d = defaultSettings();
    return {
      ...d, ...parsed,
      silence: { ...d.silence, ...(parsed.silence ?? {}) },
      director: { ...d.director, ...(parsed.director ?? {}) },
    };
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(kv: KV, s: Settings): void {
  kv.set(KEY, JSON.stringify(s));
}
```

`panel/src/audit/log.ts`:

```ts
export interface AuditEntry { ts: string; url: string; purpose: string; destFile?: string; }

export function formatAuditLine(e: AuditEntry): string {
  return JSON.stringify(e) + '\n';
}

export function appendAudit(
  filePath: string, e: AuditEntry,
  appendFileSyncFn?: (p: string, d: string) => void,
): void {
  const append = appendFileSyncFn ?? ((p: string, d: string) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    (require('fs') as typeof import('fs')).appendFileSync(p, d);
  });
  append(filePath, formatAuditLine(e));
}

export function parseAuditLog(text: string): AuditEntry[] {
  return text.split('\n').filter(Boolean).map((l) => JSON.parse(l) as AuditEntry);
}
```

- [ ] **Step 4: Run tests** — Expected: PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: settings store and outbound-network audit log"`

---

### Task 15: Silence-removal pipeline orchestrator + UI

**Files:**
- Create: `panel/src/silence/pipeline.ts`, `panel/src/ui/SilencePanel.tsx`
- Create: `assets/pd-wav-16k-mono.epr` — export from Premiere once: Media Encoder format "Waveform Audio", 16-bit, 16000 Hz, mono; save preset; copy the `.epr` here. Document in the file `assets/README.md` how it was produced. (`scripts/build-host.mjs` from Task 1 already copies `assets/*` into `dist/`.)
- Modify: `panel/src/App.tsx` (tab navigation: Silence | Director | Settings)
- Test: `panel/src/silence/pipeline.test.ts`

**Interfaces:**
- Consumes: `HostAdapter` (Task 11), `parseWav` (4), `detectSilence` (5), compilers (6), `sequenceHash` (11), `Settings` (14).
- Produces:

```ts
// pipeline.ts
export interface SilenceAnalysis { ranges: TimeRange[]; seqHash: string; seq: SequenceInfo; totalCutSec: number; }
export async function analyzeSilence(host: HostAdapter, settings: Settings, deps: { readFileBuf: (p: string) => Promise<ArrayBuffer>; tmpDir: string }): Promise<SilenceAnalysis>;
export async function applySilenceCuts(host: HostAdapter, analysis: SilenceAnalysis, keptRanges: TimeRange[]): Promise<ApplyResult>;
// applySilenceCuts: phase 1 razors (with hash guard), refetches info, phase 2 ripple-deletes.
```

- [ ] **Step 1: Write failing test**

`panel/src/silence/pipeline.test.ts` — fake `HostAdapter` returning a canned sequence + WAV bytes containing a known silence; assert `analyzeSilence` finds the range and `applySilenceCuts` sends razor batch then delete batch:

```ts
import { describe, expect, it } from 'vitest';
import type { ApplyResult, HostAdapter } from '../adapters/HostAdapter';
import type { SequenceInfo } from '../operations/model';
import type { OperationBatch } from '../operations/schema';
import { defaultSettings } from '../lib/settings';
import { analyzeSilence, applySilenceCuts } from './pipeline';

function makeWav(parts: Array<{ sec: number; amp: number }>, sr = 16000): ArrayBuffer {
  const total = parts.reduce((s, p) => s + Math.round(p.sec * sr), 0);
  const buf = new ArrayBuffer(44 + total * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + total * 2, true); w(8, 'WAVE');
  w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, total * 2, true);
  let i = 0;
  for (const p of parts) for (let k = 0; k < Math.round(p.sec * sr); k++) {
    v.setInt16(44 + i++ * 2, Math.round(p.amp * 32767 * Math.sin((2 * Math.PI * 220 * k) / sr)), true);
  }
  return buf;
}

function fakeHost(seqs: SequenceInfo[]): HostAdapter & { batches: OperationBatch[] } {
  let call = 0;
  const batches: OperationBatch[] = [];
  return {
    batches,
    ping: async () => true,
    getSequenceInfo: async () => seqs[Math.min(call++, seqs.length - 1)]!,
    exportAudio: async () => '/tmp/fake.wav',
    applyOperations: async (b): Promise<ApplyResult> => { batches.push(b); return { ok: true, applied: b.ops.length }; },
  };
}

const SEQ_BEFORE: SequenceInfo = {
  name: 's', endSec: 4, fps: 30, audioTracks: [],
  videoTracks: [{ index: 0, name: 'V1', clips: [{ index: 0, nodeId: 'a', name: '', startSec: 0, endSec: 4, enabled: true }] }],
};
const SEQ_AFTER_RAZOR: SequenceInfo = {
  ...SEQ_BEFORE,
  videoTracks: [{ index: 0, name: 'V1', clips: [
    { index: 0, nodeId: 'a1', name: '', startSec: 0, endSec: 1, enabled: true },
    { index: 1, nodeId: 'a2', name: '', startSec: 1, endSec: 3, enabled: true },
    { index: 2, nodeId: 'a3', name: '', startSec: 3, endSec: 4, enabled: true },
  ] }],
};

describe('silence pipeline', () => {
  const settings = { ...defaultSettings(), wavPresetPath: '/p.epr' };
  const wav = makeWav([{ sec: 1, amp: 0.5 }, { sec: 2, amp: 0.001 }, { sec: 1, amp: 0.5 }]);

  it('analyzes exported audio into cut ranges', async () => {
    const host = fakeHost([SEQ_BEFORE]);
    const a = await analyzeSilence(host, { ...settings, silence: { ...settings.silence, paddingMs: 0 } }, {
      readFileBuf: async () => wav, tmpDir: '/tmp',
    });
    expect(a.ranges).toHaveLength(1);
    expect(a.totalCutSec).toBeGreaterThan(1.5);
  });

  it('applies razors then deletes in two phases', async () => {
    // fake applyOperations does not itself refetch, so getSequenceInfo call order is:
    // analyze (SEQ_BEFORE), post-razor refetch (SEQ_AFTER_RAZOR)
    const host = fakeHost([SEQ_BEFORE, SEQ_AFTER_RAZOR]);
    const a = await analyzeSilence(host, { ...settings, silence: { ...settings.silence, paddingMs: 0 } }, {
      readFileBuf: async () => wav, tmpDir: '/tmp',
    });
    const r = await applySilenceCuts(host, a, a.ranges);
    expect(r.ok).toBe(true);
    expect(host.batches[0]!.ops.every((o) => o.type === 'razorAll')).toBe(true);
    expect(host.batches[1]!.ops).toHaveLength(1); // the [1,3] silent clip
    expect(host.batches[1]!.ops.every((o) => o.type === 'rippleDelete')).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure** — FAIL.

- [ ] **Step 3: Implement**

`panel/src/silence/pipeline.ts`:

```ts
import type { ApplyResult, HostAdapter } from '../adapters/HostAdapter';
import { sequenceHash } from '../adapters/CepAdapter';
import type { SequenceInfo } from '../operations/model';
import type { Settings } from '../lib/settings';
import { parseWav } from './wav';
import { detectSilence, type TimeRange } from './detect';
import { compileRazorOps, razorTimesForRanges, selectDeleteOps } from './compile';

export interface SilenceAnalysis { ranges: TimeRange[]; seqHash: string; seq: SequenceInfo; totalCutSec: number; }

export async function analyzeSilence(
  host: HostAdapter, settings: Settings,
  deps: { readFileBuf: (p: string) => Promise<ArrayBuffer>; tmpDir: string },
): Promise<SilenceAnalysis> {
  const seq = await host.getSequenceInfo();
  const wavPath = await host.exportAudio(`${deps.tmpDir}/pd-audio-${Date.now()}.wav`, settings.wavPresetPath);
  const { samples, sampleRate } = parseWav(await deps.readFileBuf(wavPath));
  const ranges = detectSilence(samples, sampleRate, settings.silence);
  const totalCutSec = ranges.reduce((s, r) => s + (r.endSec - r.startSec), 0);
  return { ranges, seq, seqHash: sequenceHash(seq), totalCutSec };
}

export async function applySilenceCuts(
  host: HostAdapter, analysis: SilenceAnalysis, keptRanges: TimeRange[],
): Promise<ApplyResult> {
  if (!keptRanges.length) return { ok: true, applied: 0 };
  const razors = compileRazorOps(razorTimesForRanges(keptRanges));
  const r1 = await host.applyOperations({ ops: razors }, analysis.seqHash);
  if (!r1.ok) return r1;
  const after = await host.getSequenceInfo();
  const deletes = selectDeleteOps(after, keptRanges);
  const r2 = await host.applyOperations({ ops: deletes });
  return r2.ok ? { ok: true, applied: r1.applied + r2.applied } : r2;
}
```

`panel/src/ui/SilencePanel.tsx`:

```tsx
import { useState } from 'react';
import type { HostAdapter } from '../adapters/HostAdapter';
import type { Settings } from '../lib/settings';
import type { TimeRange } from '../silence/detect';
import { analyzeSilence, applySilenceCuts, type SilenceAnalysis } from '../silence/pipeline';

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

  return (
    <div>
      <button disabled={busy} onClick={analyze}>Analyze silence</button>
      {analysis && (
        <>
          <ul>
            {analysis.ranges.map((r, i) => (
              <li key={i}>
                <label>
                  <input type="checkbox" checked={kept.has(i)}
                    onChange={(e) => setKept((prev) => { const n = new Set(prev); e.target.checked ? n.add(i) : n.delete(i); return n; })} />
                  {fmt(r.startSec)} → {fmt(r.endSec)} ({(r.endSec - r.startSec).toFixed(1)}s)
                </label>
              </li>
            ))}
          </ul>
          <button disabled={busy || kept.size === 0} onClick={apply}>Apply {kept.size} cuts</button>
        </>
      )}
      <p>{msg}</p>
    </div>
  );
}
```

`panel/src/App.tsx` (replace):

```tsx
import { useMemo, useState } from 'react';
import { CepAdapter } from './adapters/CepAdapter';
import type { HostAdapter } from './adapters/HostAdapter';
import { defaultSettings, loadSettings, localStorageKV, saveSettings, type Settings } from './lib/settings';
import { SilencePanel } from './ui/SilencePanel';

function nodeDeps() {
  const fs = require('fs') as typeof import('fs');
  const os = require('os') as typeof import('os');
  return {
    readFileBuf: async (p: string) => {
      const b = fs.readFileSync(p);
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    },
    tmpDir: os.tmpdir(),
  };
}

export function App() {
  const [tab, setTab] = useState<'silence' | 'director' | 'settings'>('silence');
  const [settings, setSettings] = useState<Settings>(() => {
    try { return loadSettings(localStorageKV); } catch { return defaultSettings(); }
  });
  const host: HostAdapter | null = useMemo(() => {
    try { return new CepAdapter(); } catch { return null; }
  }, []);
  const deps = useMemo(nodeDeps, []);

  const update = (s: Settings) => { setSettings(s); saveSettings(localStorageKV, s); };

  if (!host) return <div className="app"><p>Premiere Director must run inside Premiere Pro.</p></div>;
  return (
    <div className="app">
      <nav>
        {(['silence', 'director', 'settings'] as const).map((t) => (
          <button key={t} disabled={tab === t} onClick={() => setTab(t)}>{t}</button>
        ))}
      </nav>
      {tab === 'silence' && <SilencePanel host={host} settings={settings} deps={deps} />}
      {tab === 'director' && <p>Director — Task 16.</p>}
      {tab === 'settings' && <SettingsForm settings={settings} onChange={update} />}
    </div>
  );
}

function SettingsForm({ settings, onChange }: { settings: Settings; onChange: (s: Settings) => void }) {
  const [dl, setDl] = useState('');
  const path = (label: string, key: keyof Settings) => (
    <label style={{ display: 'block', marginBottom: 6 }}>
      {label}
      <input style={{ width: '100%' }} value={String(settings[key])}
        onChange={(e) => onChange({ ...settings, [key]: e.target.value })} />
    </label>
  );
  const downloadModel = async () => {
    // Explicit, user-initiated, audit-logged network call — the only one in v1.
    const os = require('os') as typeof import('os');
    const fs = require('fs') as typeof import('fs');
    const pathMod = require('path') as typeof import('path');
    const { downloadFile, WHISPER_MODEL_URL } = await import('../asr/download');
    const { appendAudit } = await import('../audit/log');
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
    <div>
      {path('whisper-cli binary', 'whisperBinPath')}
      {path('whisper model (.bin)', 'whisperModelPath')}
      <button onClick={downloadModel}>Download base.en model</button> <span>{dl}</span>
      {path('sherpa-onnx diarization binary', 'diarizeBinPath')}
      {path('segmentation model', 'diarizeSegModelPath')}
      {path('embedding model', 'diarizeEmbModelPath')}
      {path('WAV export preset (.epr)', 'wavPresetPath')}
    </div>
  );
}
```

- [ ] **Step 4: Run tests + build** — `npm test` PASS; `npm run build` exits 0. Note: `require('fs')` works in the CEP mixed Node context; the vite `external` config from Task 1 keeps these out of the bundle graph.

- [ ] **Step 5: Create the `.epr` preset** — on the dev machine, in Premiere/AME create the WAV 16 kHz mono 16-bit preset described in Files above, save to `assets/pd-wav-16k-mono.epr`, and write `assets/README.md` documenting the exact settings. (If working headless, commit `assets/README.md` with instructions and a `MISSING:` marker; the Task 18 checklist requires the real file before release.)

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: silence-removal pipeline, panel UI with tabs and settings form"`

---

### Task 16: Director pipeline orchestrator + UI

**Files:**
- Create: `panel/src/director/pipeline.ts`, `panel/src/ui/DirectorPanel.tsx`
- Modify: `panel/src/App.tsx` (mount `DirectorPanel` in the director tab)
- Test: `panel/src/director/pipeline.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 7–13 + `HostAdapter`.
- Produces:

```ts
// pipeline.ts
export interface DirectorAnalysis { utterances: Utterance[]; speakers: string[]; seq: SequenceInfo; seqHash: string; }
export async function analyzeDialogue(host: HostAdapter, settings: Settings, deps: PipelineDeps): Promise<DirectorAnalysis>;
// export audio -> transcribe -> diarize -> assignSpeakers -> mergeUtterances
export interface PipelineDeps { run: Runner; readFile: (p: string) => Promise<string>; readFileBuf: (p: string) => Promise<ArrayBuffer>; tmpDir: string; }
export function planCameraCuts(analysis: DirectorAnalysis, map: CameraMap, cfg: DirectorConfig, initialTrack: number): SwitchPoint[];
export async function applyCameraCuts(host: HostAdapter, analysis: DirectorAnalysis, switches: SwitchPoint[], map: CameraMap, initialTrack: number): Promise<ApplyResult>;
// phase 1: razorAll at each switch time (hash-guarded); phase 2: refetch, segments -> compileEnableOps
```

- [ ] **Step 1: Write failing test**

`panel/src/director/pipeline.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { ApplyResult, HostAdapter } from '../adapters/HostAdapter';
import type { SequenceInfo } from '../operations/model';
import type { OperationBatch } from '../operations/schema';
import { defaultSettings } from '../lib/settings';
import { DEFAULT_DIRECTOR_CONFIG } from './types';
import { analyzeDialogue, applyCameraCuts, planCameraCuts } from './pipeline';

const WHISPER_JSON = JSON.stringify({
  transcription: [
    { offsets: { from: 0, to: 3000 }, text: ' Long opening statement here.' },
    { offsets: { from: 3200, to: 6000 }, text: ' And a long reply as well.' },
  ],
});
const DIAR = '0.0 -- 3.1 speaker_00\n3.1 -- 6.0 speaker_01\n';

function twoTrackSeq(clipsPerTrack: Array<Array<[number, number]>>): SequenceInfo {
  return {
    name: 's', endSec: 6, fps: 30, audioTracks: [],
    videoTracks: clipsPerTrack.map((clips, t) => ({
      index: t, name: `V${t + 1}`,
      clips: clips.map(([s, e], i) => ({ index: i, nodeId: `t${t}c${i}`, name: '', startSec: s, endSec: e, enabled: true })),
    })),
  };
}

function fakeHost(seqs: SequenceInfo[]) {
  let call = 0;
  const batches: OperationBatch[] = [];
  const host: HostAdapter & { batches: OperationBatch[] } = {
    batches,
    ping: async () => true,
    getSequenceInfo: async () => seqs[Math.min(call++, seqs.length - 1)]!,
    exportAudio: async () => '/tmp/fake.wav',
    applyOperations: async (b): Promise<ApplyResult> => { batches.push(b); return { ok: true, applied: b.ops.length }; },
  };
  return host;
}

const deps = {
  run: async () => ({ exitCode: 0, stdout: DIAR, stderr: '' }),
  readFile: async () => WHISPER_JSON,
  readFileBuf: async () => new ArrayBuffer(0),
  tmpDir: '/tmp',
};
const settings = {
  ...defaultSettings(), wavPresetPath: '/p.epr',
  whisperBinPath: '/w', whisperModelPath: '/m',
  diarizeBinPath: '/d', diarizeSegModelPath: '/s', diarizeEmbModelPath: '/e',
};

describe('director pipeline', () => {
  it('produces speaker-labeled merged utterances', async () => {
    const a = await analyzeDialogue(fakeHost([twoTrackSeq([[[0, 6]], [[0, 6]]])]), settings, deps);
    expect(a.speakers.sort()).toEqual(['speaker_00', 'speaker_01']);
    expect(a.utterances).toHaveLength(2);
  });
  it('plans and applies cuts as razor batch + enable batch', async () => {
    const before = twoTrackSeq([[[0, 6]], [[0, 6]]]);
    const afterRazor = twoTrackSeq([[[0, 3.2], [3.2, 6]], [[0, 3.2], [3.2, 6]]]);
    // call order: analyze (before), post-razor refetch (afterRazor)
    const host = fakeHost([before, afterRazor]);
    const a = await analyzeDialogue(host, settings, deps);
    const map = { speakerToTrack: { speaker_00: 0, speaker_01: 1 }, wideTrackIndex: null };
    const switches = planCameraCuts(a, map, DEFAULT_DIRECTOR_CONFIG, 0);
    expect(switches).toHaveLength(1);
    const r = await applyCameraCuts(host, a, switches, map, 0);
    expect(r.ok).toBe(true);
    expect(host.batches[0]!.ops.every((o) => o.type === 'razorAll')).toBe(true);
    // V1 second half disabled, V2 first half disabled
    expect(host.batches[1]!.ops).toHaveLength(2);
    expect(host.batches[1]!.ops.every((o) => o.type === 'setClipEnabled')).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure** — FAIL.

- [ ] **Step 3: Implement**

`panel/src/director/pipeline.ts`:

```ts
import type { ApplyResult, HostAdapter } from '../adapters/HostAdapter';
import { sequenceHash } from '../adapters/CepAdapter';
import type { SequenceInfo } from '../operations/model';
import type { Settings } from '../lib/settings';
import type { Runner } from '../asr/run';
import { transcribe } from '../asr/whisper';
import { assignSpeakers, diarize } from '../asr/diarize';
import { mergeUtterances } from './preprocess';
import { planSwitches } from './engine';
import { compileEnableOps, switchesToSegments } from './compile';
import { compileRazorOps } from '../silence/compile';
import type { CameraMap, DirectorConfig, SwitchPoint, Utterance } from './types';

export interface PipelineDeps {
  run: Runner;
  readFile: (p: string) => Promise<string>;
  readFileBuf: (p: string) => Promise<ArrayBuffer>;
  tmpDir: string;
}

export interface DirectorAnalysis { utterances: Utterance[]; speakers: string[]; seq: SequenceInfo; seqHash: string; }

export async function analyzeDialogue(host: HostAdapter, settings: Settings, deps: PipelineDeps): Promise<DirectorAnalysis> {
  const seq = await host.getSequenceInfo();
  const wavPath = await host.exportAudio(`${deps.tmpDir}/pd-dialogue-${Date.now()}.wav`, settings.wavPresetPath);
  const raw = await transcribe(wavPath, { binPath: settings.whisperBinPath, modelPath: settings.whisperModelPath }, deps);
  const segs = await diarize(wavPath, {
    binPath: settings.diarizeBinPath, segModelPath: settings.diarizeSegModelPath, embModelPath: settings.diarizeEmbModelPath,
  }, deps.run);
  const labeled = assignSpeakers(raw, segs);
  const merged = mergeUtterances(labeled, settings.director.gapBridgeSec);
  const speakers = [...new Set(merged.map((u) => u.speakerId))];
  return { utterances: merged, speakers, seq, seqHash: sequenceHash(seq) };
}

export function planCameraCuts(analysis: DirectorAnalysis, map: CameraMap, cfg: DirectorConfig, initialTrack: number): SwitchPoint[] {
  return planSwitches(analysis.utterances, map, cfg, initialTrack);
}

export async function applyCameraCuts(
  host: HostAdapter, analysis: DirectorAnalysis, switches: SwitchPoint[], map: CameraMap, initialTrack: number,
): Promise<ApplyResult> {
  if (!switches.length) return { ok: true, applied: 0 };
  const razors = compileRazorOps([...new Set(switches.map((s) => s.timeSec))].sort((a, b) => a - b));
  const r1 = await host.applyOperations({ ops: razors }, analysis.seqHash);
  if (!r1.ok) return r1;
  const after = await host.getSequenceInfo();
  const cameraTracks = [
    ...new Set([...Object.values(map.speakerToTrack).filter((t): t is number => t != null),
      ...(map.wideTrackIndex != null ? [map.wideTrackIndex] : [])]),
  ];
  const segments = switchesToSegments(switches, 0, after.endSec, initialTrack);
  const enables = compileEnableOps(after, segments, cameraTracks);
  const r2 = await host.applyOperations({ ops: enables });
  return r2.ok ? { ok: true, applied: r1.applied + r2.applied } : r2;
}
```

`panel/src/ui/DirectorPanel.tsx`:

```tsx
import { useState } from 'react';
import type { HostAdapter } from '../adapters/HostAdapter';
import type { Settings } from '../lib/settings';
import type { CameraMap, SwitchPoint } from '../director/types';
import { analyzeDialogue, applyCameraCuts, planCameraCuts, type DirectorAnalysis, type PipelineDeps } from '../director/pipeline';

export function DirectorPanel(props: { host: HostAdapter; settings: Settings; deps: PipelineDeps }) {
  const [analysis, setAnalysis] = useState<DirectorAnalysis | null>(null);
  const [mapping, setMapping] = useState<Record<string, number | null>>({});
  const [wide, setWide] = useState<number | null>(null);
  const [switches, setSwitches] = useState<SwitchPoint[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const cfg = props.settings.director;
  const cameraMap = (): CameraMap => ({ speakerToTrack: mapping, wideTrackIndex: wide });
  const initialTrack = () => {
    const first = Object.values(mapping).find((t) => t != null);
    return first ?? 0;
  };

  const analyze = async () => {
    setBusy(true); setMsg('Transcribing + diarizing (this can take a while)…');
    try {
      const a = await analyzeDialogue(props.host, props.settings, props.deps);
      setAnalysis(a); setSwitches(null);
      setMapping(Object.fromEntries(a.speakers.map((s) => [s, null])));
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
      setMsg(r.ok ? `Done — ${r.applied} operations.` : `Failed: ${r.error ?? 'unknown'}`);
    } catch (e) { setMsg(String(e)); } finally { setBusy(false); }
  };

  const tracks = analysis?.seq.videoTracks ?? [];
  return (
    <div>
      <p>Requires each camera stacked on its own video track, synced, with dialogue audio in the sequence.</p>
      <button disabled={busy} onClick={analyze}>Analyze dialogue</button>
      {analysis && (
        <>
          <h3>Speaker → camera</h3>
          {analysis.speakers.map((s) => (
            <label key={s} style={{ display: 'block' }}>
              {s}
              <select value={mapping[s] ?? ''} onChange={(e) => setMapping({ ...mapping, [s]: e.target.value === '' ? null : Number(e.target.value) })}>
                <option value="">off-camera</option>
                {tracks.map((t) => <option key={t.index} value={t.index}>V{t.index + 1} {t.name}</option>)}
              </select>
            </label>
          ))}
          <label style={{ display: 'block' }}>
            Wide shot
            <select value={wide ?? ''} onChange={(e) => setWide(e.target.value === '' ? null : Number(e.target.value))}>
              <option value="">none</option>
              {tracks.map((t) => <option key={t.index} value={t.index}>V{t.index + 1} {t.name}</option>)}
            </select>
          </label>
          <button disabled={busy} onClick={plan}>Plan switches</button>
        </>
      )}
      {switches && (
        <>
          <ol>
            {switches.map((s, i) => (
              <li key={i}>
                {s.timeSec.toFixed(2)}s → V{s.toTrackIndex + 1} <em>({s.reason})</em>
                <button onClick={() => setSwitches(switches.filter((_, k) => k !== i))}>✕</button>
              </li>
            ))}
          </ol>
          <button disabled={busy || switches.length === 0} onClick={apply}>Apply {switches.length} switches</button>
        </>
      )}
      <p>{msg}</p>
    </div>
  );
}
```

In `panel/src/App.tsx`, replace the director placeholder: import `DirectorPanel` and the `Runner`/fs deps —

```tsx
import { DirectorPanel } from './ui/DirectorPanel';
import { nodeRunner } from './asr/run';
// extend nodeDeps():
//   run: nodeRunner,
//   readFile: async (p: string) => fs.readFileSync(p, 'utf8'),
// and render:
{tab === 'director' && <DirectorPanel host={host} settings={settings} deps={deps} />}
```

(Full `nodeDeps` after this task returns `{ run, readFile, readFileBuf, tmpDir }` — one object satisfying both panels' deps.)

- [ ] **Step 4: Run tests + build** — `npm test` all PASS; `npm run build` exits 0.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: director pipeline and camera-switching panel UI"`

---

### Task 17: Provider interfaces and stubs

**Files:**
- Create: `providers/types.ts`, `providers/transcription/whisper-cpp.md`, `providers/llm/README.md`, `providers/separation/README.md`, `providers/generation/README.md`
- Test: none (type-only + docs; `tsc --noEmit` covers it)

**Interfaces:**
- Produces the community extension surface:

`providers/types.ts`:

```ts
// Premiere Director provider contracts. Implementations live beside these types;
// the panel imports from here. Every provider MUST declare its network endpoints
// so calls can be routed through the audit log, and MUST NOT hardcode credentials.

export interface ProviderInfo {
  id: string;               // e.g. 'whisper-cpp'
  displayName: string;
  kind: 'transcription' | 'llm' | 'separation' | 'generation';
  networkEndpoints: string[]; // [] means fully local
}

export interface UtteranceLike { startSec: number; endSec: number; speakerId: string; text: string; }

export interface TranscriptionProvider {
  info: ProviderInfo;
  transcribe(wavPath: string): Promise<UtteranceLike[]>;
}

// Defined for v1.x — NOT implemented in v1. The LLM contract is the closed operation
// schema in panel/src/operations/schema.ts: providers return operation batches, never code.
export interface LlmProvider {
  info: ProviderInfo;
  planOperations(prompt: string, sequenceJson: string): Promise<unknown /* OperationBatch, validated by caller */>;
}

export interface SeparationProvider {
  info: ProviderInfo;
  separate(wavPath: string, stems: Array<'vocals' | 'drums' | 'bass' | 'other'>): Promise<string[]>; // stem file paths
}

export interface GenerationProvider {
  info: ProviderInfo;
  generate(prompt: string, kind: 'image' | 'video'): Promise<string>; // downloaded media path
}
```

- [ ] **Step 1: Write `providers/types.ts`** (above) and add `"providers"` to `tsconfig.json` `include`.
- [ ] **Step 2: Write the four READMEs** — each states: status (implemented / interface-only), how to implement (implement the interface, register `ProviderInfo`, declare endpoints, route downloads through `appendAudit`), and for `transcription/whisper-cpp.md`: where the actual implementation lives (`panel/src/asr/whisper.ts`), which binary/model to install (whisper.cpp `whisper-cli`; `ggml-base.en.bin` via the Settings download), and the CLI contract (`-m model -f wav -oj -of outbase`).
- [ ] **Step 3: Verify** — `npx tsc --noEmit` exits 0; `npm test` still PASS.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: provider contracts and extension-surface docs"`

---

### Task 18: Packaging, CI, docs, integration checklist

**Files:**
- Create: `scripts/package-zxp.sh`, `.github/workflows/ci.yml`
- Create: `README.md`, `LICENSE` (MIT), `docs/privacy.md`, `docs/providers.md`, `docs/integration-checklist.md`

**Interfaces:**
- Consumes: `npm run build` output layout (Task 1).
- Produces: signed `premiere-director-<version>.zxp` from `scripts/package-zxp.sh`; green CI on push; release packaging on `v*` tags.

- [ ] **Step 1: Write `scripts/package-zxp.sh`**

```bash
#!/usr/bin/env bash
# Package dist/ into a signed ZXP. Requires ZXPSignCmd (Adobe-CEP/CEP-Resources) on PATH
# or at $ZXPSIGNCMD. Generates a self-signed cert if $PD_CERT_P12 is not provided.
set -euo pipefail
VERSION="$(node -p "require('./package.json').version")"
OUT="premiere-director-${VERSION}.zxp"
SIGN="${ZXPSIGNCMD:-ZXPSignCmd}"
CERT="${PD_CERT_P12:-build-cert.p12}"
PASS="${PD_CERT_PASS:-premiere-director}"

npm run build
if [ ! -f "$CERT" ]; then
  "$SIGN" -selfSignedCert US GA "PremiereDirector" "PremiereDirector" "$PASS" "$CERT"
fi
rm -f "$OUT"
# NOTE: dist/ must contain no symlinks — signing symlinked ZXPs yields blank panels.
find dist -type l -print -quit | grep -q . && { echo "symlink found in dist/ — abort"; exit 1; }
"$SIGN" -sign dist "$OUT" "$CERT" "$PASS" -tsa http://timestamp.digicert.com
"$SIGN" -verify "$OUT"
echo "Packaged $OUT"
```

Run: `chmod +x scripts/package-zxp.sh`

- [ ] **Step 2: Write `.github/workflows/ci.yml`**

```yaml
name: ci
on:
  push: { branches: [main], tags: ['v*'] }
  pull_request:
jobs:
  test-build:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with: { name: dist, path: dist/ }
  package:
    if: startsWith(github.ref, 'refs/tags/v')
    needs: test-build
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - name: Fetch ZXPSignCmd
        run: |
          curl -fsSL -o ZXPSignCmd https://github.com/Adobe-CEP/CEP-Resources/raw/master/ZXPSignCMD/4.1.2/macOS/ZXPSignCmd-64bit
          chmod +x ZXPSignCmd
      - run: ZXPSIGNCMD=./ZXPSignCmd ./scripts/package-zxp.sh
      - uses: softprops/action-gh-release@v2
        with: { files: 'premiere-director-*.zxp' }
```

- [ ] **Step 3: Write docs**

`LICENSE`: standard MIT text, copyright "Premiere Director contributors".

`README.md` must cover: what it is (open-source AI editing assistant panel; no affiliation with Adobe or any AI vendor); requirements (Premiere Pro 2026 / 26.x, macOS or Windows, whisper.cpp + sherpa-onnx binaries for the Director feature); dev install (`npm install && npm run build && ./scripts/dev-install.sh`, PlayerDebugMode note, Windows registry equivalent `HKCU\Software\Adobe\CSXS.12 PlayerDebugMode=1`); the CEP sunset paragraph (CEP 12 is final, ExtendScript supported through ~Sept 2026, UXP port tracked as the roadmap via the HostAdapter seam); feature docs for Silence and Director (including the stacked-tracks prerequisite and why true multicam is API-blocked, with the Adobe forum citation); settings/binaries setup; troubleshooting (panel not visible → PlayerDebugMode + restart; blank panel → check `http://localhost:7002`).

`docs/privacy.md`: v1 is fully local; the only network call is user-initiated model download; audit log location (`<extension data dir>/audit.jsonl`) and format; future cloud providers must declare endpoints and route through the audit log; full footage never leaves the machine — only derived data (audio exports, transcripts) is ever eligible.

`docs/providers.md`: expand `providers/types.ts` contracts into a how-to: implement interface, declare `networkEndpoints`, no hardcoded keys (keys via panel settings only), how the LLM contract constrains output to the operation schema, PR checklist.

- [ ] **Step 4: Write `docs/integration-checklist.md`** — the manual test protocol against live Premiere Pro 2026:

```md
# Integration checklist (run per Premiere point release)

Fixture: 3 video tracks (V1 A-cam, V2 B-cam, V3 wide), same 60s take synced, A/V linked
dialogue on A1; second fixture: single-track talking head with long pauses.

1. Bridge: PD_ping → "pong"; PD_getSequenceInfo lists all tracks/clips with correct times.
2. Export: Analyze silence produces a WAV in tmp; file opens; sample rate 16k mono.
3. Silence: on the talking-head fixture, detected ranges match audible pauses (±0.2s);
   Apply razors at boundaries and ripple-deletes silent clips; linked audio follows;
   ONE Edit > Undo step per applied batch restores (document actual undo granularity).
4. Razor accuracy: cuts land on the expected frame at 23.976/29.97 (drop-frame!) and 25fps.
   If off on drop-frame, fix _pdSmpte separator/rounding (Task 10 note).
5. Director: analyze detects 2+ speakers; mapping UI lists tracks; plan produces sane
   switches; apply razors all camera tracks and enables exactly one camera per segment.
6. Staleness: analyze, then manually move a clip, then Apply → aborts with "sequence changed".
7. Failure surface: point whisper path at a bogus binary → readable error in panel, no mutation.
8. dist/ contains no symlinks; packaged ZXP verifies with ZXPSignCmd -verify.
```

- [ ] **Step 5: Verify** — `npm test` PASS; `npm run build` exits 0; `bash -n scripts/package-zxp.sh` exits 0.
- [ ] **Step 6: Commit** — `git add -A && git commit -m "chore: ZXP packaging, CI, README, privacy and provider docs, integration checklist"`

---

## Post-plan validation (before calling v1 done)

Run the full `docs/integration-checklist.md` against Premiere Pro 2026 on this machine with both fixture projects, and fix what it surfaces (most likely: QE razor timecode format on drop-frame sequences, `.epr` preset path handling, `exportAsMediaDirect` output-path quirks). These are expected-iteration items, not unknowns — the pure-logic layers are fully covered by unit tests before you ever open Premiere.
