# Premiere Director

Premiere Director is an open-source CEP panel for Adobe Premiere Pro that automates two
editing tasks from a transcript: removing silence from a single-track recording, and
cutting a multi-camera dialogue scene by speaker. It is a community project with no
affiliation to Adobe, OpenAI, Hugging Face, or any AI/model vendor named in this
document — it is a client that shells out to tools you install yourself.

**Status: v1 is implemented and unit-tested, but has not yet been run against a live
copy of Premiere Pro.** See [Status and known gaps](#status-and-known-gaps) below
before you rely on it for real footage.

## What it does

- **Silence removal** — exports the active sequence's audio, detects silent ranges,
  and lets you razor + ripple-delete them in one batch.
- **Director (multicam-by-editing)** — transcribes and diarizes dialogue across
  multiple camera tracks, lets you map each detected speaker to a camera track, plans
  camera switches, and applies them as razors + per-clip enable/disable across all
  video tracks.

Both features work by producing a validated batch of primitive edit operations
(`razorAll`, `rippleDelete`, `setClipEnabled` — see `panel/src/operations/schema.ts`)
that the ExtendScript host bridge applies to the sequence. The panel never sends
freeform scripts or code to Premiere; every mutation is one of those three operation
types, validated before it runs.

## Why "stacked tracks" instead of true multicam

Director does not create or drive a Premiere multicam source sequence. It works on
plain video tracks stacked in the timeline (one camera per track, synced), and cuts
between them with `setClipEnabled`/razor operations. This is a deliberate workaround,
not a missing feature: there is no ExtendScript, QE, UXP, or C++ API in Premiere Pro
for creating a multicam sequence or setting its active angle programmatically. Adobe
staff [have confirmed this gap](https://community.adobe.com/t5/premiere-pro-discussions/editing-with-multicam-via-script/m-p/14155138)
on the Premiere Pro community forums ([further discussion](https://community.adobe.com/questions-729/create-and-manipulate-multi-camera-sequence-using-premiere-pro-sdk-1426162)). Until Adobe
exposes that API, stacked-track switching is the only way to automate a multicam-style
cut from outside the UI.

## Requirements

- Adobe Premiere Pro **2026 (26.x)**. This targets CEP 12; it has not been tested
  against earlier Premiere versions and may not install on them.
- macOS or Windows.
- [Node.js](https://nodejs.org/) 20+ and npm, to build the panel from source.
- For the Director feature (transcription + diarization), you supply your own
  binaries — nothing is bundled:
  - [`whisper.cpp`](https://github.com/ggerganov/whisper.cpp)'s `whisper-cli` binary
    and a GGML model file (a "Download base.en model" button in Settings can fetch
    `ggml-base.en.bin` for you — see [Privacy](docs/privacy.md)).
  - [`sherpa-onnx`](https://github.com/k2-fsa/sherpa-onnx)'s offline-speaker-diarization
    CLI binary, plus its segmentation and embedding models.
- For Silence, an Adobe Media Encoder export preset that is **not currently included
  in this repo** — see [The missing `.epr` preset](#the-missing-epr-preset) below.
  Silence detection does not work until you produce this file.

## Dev install

```sh
npm install
npm run build
./scripts/dev-install.sh
```

`npm run build` runs `vite build` (bundles the panel into `dist/`) followed by
`node scripts/build-host.mjs` (concatenates `host/*.jsx` into `dist/host/index.jsx`
and copies `csxs/manifest.xml`, `csxs/.debug`, and everything in `assets/` into
`dist/`).

`scripts/dev-install.sh` enables CEP's `PlayerDebugMode` (required for unsigned
extensions) and symlinks `dist/` into Premiere's user extensions folder:

- macOS: runs `defaults write com.adobe.CSXS.12 PlayerDebugMode 1`, then symlinks
  `dist/` to `~/Library/Application Support/Adobe/CEP/extensions/premiere-director`.
- Windows: `dev-install.sh` is a bash script and won't run natively in `cmd`/PowerShell.
  Set the equivalent registry key yourself —
  `HKCU\Software\Adobe\CSXS.12` → `PlayerDebugMode` (string) = `1` — and copy or
  symlink `dist\` into
  `%APPDATA%\Adobe\CEP\extensions\premiere-director`.

Restart Premiere Pro afterward, then open **Window > Extensions > Premiere Director**.

Note: `scripts/package-zxp.sh` explicitly refuses to sign a `dist/` that contains
symlinks (a signed ZXP with symlinked contents renders a blank panel), but
`dev-install.sh`'s symlink-the-whole-`dist/` approach is fine for local development —
only packaging cares.

## Remote debugging

The extension listens for the CEP Chrome remote debugger on **port 7002**
(`csxs/.debug`, `csxs/manifest.xml`'s `Host Port="7002"`). If the panel loads blank,
open `http://localhost:7002` in Chrome to inspect it directly.

## The missing `.epr` preset

`Settings.wavPresetPath` needs an Adobe Media Encoder export preset
(`assets/pd-wav-16k-mono.epr`) that renders 16kHz mono 16-bit WAV — the format
`whisper.cpp` and this repo's WAV parser (`panel/src/silence/wav.ts`) expect. That
file is **not in this repository**: it was never produced because Task 15/18 were
implemented in a headless environment with no running Premiere Pro / AME available to
export one. `assets/README.md` documents the exact export settings needed to produce
it (Waveform Audio, 16000 Hz, mono, 16-bit) and where AME normally saves presets.
Both Silence and Director depend on this preset (via `CepAdapter.exportAudio`) —
**neither feature can export the scratch audio it needs until this file exists** and
`wavPresetPath` in Settings points at it.

## Settings

Open the **Settings** tab in the panel to configure:

| Field | Purpose |
|---|---|
| `whisper-cli binary` | Path to your `whisper.cpp` `whisper-cli` executable |
| `whisper model (.bin)` | Path to a GGML whisper model, or use the download button |
| `sherpa-onnx diarization binary` | Path to the offline-speaker-diarization CLI |
| `segmentation model` / `embedding model` | Paths to the two sherpa-onnx models it needs |
| `WAV export preset (.epr)` | Path to the preset described above, once you've made it |

The **"Download base.en model"** button fetches `ggml-base.en.bin` from Hugging Face
to `~/.premiere-director/ggml-base.en.bin` and is the only network call this project
makes on its own — every download is logged to
`~/.premiere-director/audit.jsonl` before the request fires. See
[docs/privacy.md](docs/privacy.md) for the full data-flow description.

## Using Silence

1. Open the sequence you want to clean up.
2. **Silence** tab → **Analyze silence**. This exports the sequence's audio via the
   `.epr` preset above, then runs local silence detection over the resulting WAV.
3. Uncheck any detected silent ranges you want to keep.
4. **Apply N cuts** — razors the sequence at each range boundary and ripple-deletes
   the silent clips (linked audio/video follows the ripple).

## Using Director

Director requires the sequence to already be built as **stacked camera tracks**: one
video track per camera, all synced to the same take, with the spoken dialogue on an
audio track (see the fixture layout in
[docs/integration-checklist.md](docs/integration-checklist.md)). It does not create
this layout for you.

1. **Director** tab → **Analyze dialogue**. This exports audio, transcribes it
   (`whisper-cli`), and diarizes speakers (`sherpa-onnx`), producing a list of
   utterances and detected speakers. This step can take a while — it runs two local
   ML binaries over the full take.
2. For each detected speaker, choose which camera track (or "off-camera") they map to.
   Optionally choose a wide-shot track as the fallback.
3. **Plan switches** — produces a proposed list of camera-switch timestamps. Remove
   any switch you don't want.
4. **Apply N switches** — razors every video track at each switch point and enables
   exactly one camera track per resulting segment.

If you re-run Analyze after the sequence has changed, Apply is expected to detect the
mismatch and abort with a "sequence changed" error rather than cut against stale data
(`CepAdapter.applyOperations`'s `expectedHash` check) — this is one of the behaviors
[docs/integration-checklist.md](docs/integration-checklist.md) verifies live.

## The CEP-to-UXP transition

Adobe has stated that **CEP 12 is the final CEP release**, and that ExtendScript
support continues for existing extensions through roughly **September 2026**
([Premiere Pro Scripting Guide](https://ppro-scripting.docsforadobe.dev/),
[Adobe-CEP/Samples PProPanel ReadMe](https://github.com/Adobe-CEP/Samples/blob/master/PProPanel/ReadMe.md)). Premiere
Director targets CEP 12 today. The codebase is structured to make a future port
straightforward: every call from the panel into Premiere goes through the
`HostAdapter` interface (`panel/src/adapters/HostAdapter.ts`), currently implemented
by `CepAdapter` (`panel/src/adapters/CepAdapter.ts`), which talks to the ExtendScript
bridge in `host/index.jsx` via CEP's `evalScript`. A UXP port means writing a
`UxpAdapter` that implements the same `HostAdapter` interface against UXP's scripting
API, without touching any of the pipeline logic (silence detection, camera-cut
planning, operation validation) above it. There is no UXP implementation yet — this is
tracked as the v2 roadmap, not a current capability.

## Architecture

```
panel/src/
  adapters/       HostAdapter interface + CepAdapter (ExtendScript/CEP implementation)
  operations/     Closed operation schema + validation (razorAll, rippleDelete, setClipEnabled)
  silence/        WAV parsing, silence detection, cut-plan compilation
  director/       Camera-cut planning engine, preprocessing, compilation
  asr/            whisper.cpp + sherpa-onnx CLI adapters, model download
  audit/          Append-only audit log for any network call
  lib/            Settings persistence, timecode helpers, structural hashing
  ui/             React panels (Silence, Director) + settings form
host/
  index.jsx       ExtendScript bridge: PD_ping, PD_getSequenceInfo, PD_exportAudio, PD_execute
providers/
  types.ts        Provider contracts (transcription/llm/separation/generation) — see docs/providers.md
```

`npm run build` bundles `panel/` with Vite into `dist/`, then
`scripts/build-host.mjs` concatenates `host/*.jsx` into `dist/host/index.jsx` and
copies `csxs/manifest.xml`, `csxs/.debug`, and `assets/*` into `dist/`. That `dist/`
layout is what `scripts/dev-install.sh` symlinks for local testing and what
`scripts/package-zxp.sh` signs into a ZXP for release.

## Testing

```sh
npm test        # vitest run — 67 tests across silence, director, asr, adapters, operations
npm run build   # vite build + host/CSXS staging
```

All 67 unit tests pass and cover the pure-logic layers (silence detection math, WAV
parsing, camera-cut planning, operation schema validation, settings, audit log
formatting) using fixtures and injected fakes — none of them exercise a real Premiere
Pro process. The ExtendScript/QE bridge (`host/index.jsx`) itself has **not** been
run against live Premiere; that verification is
[docs/integration-checklist.md](docs/integration-checklist.md), and it has not been
executed yet on this machine or any other.

## Packaging a release

```sh
./scripts/package-zxp.sh
```

Requires `ZXPSignCmd` (from
[Adobe-CEP/CEP-Resources](https://github.com/Adobe-CEP/CEP-Resources)) on `PATH` or at
`$ZXPSIGNCMD`. Builds the panel, generates a self-signed cert if `$PD_CERT_P12` isn't
set, refuses to sign if `dist/` contains any symlinks, signs `dist/` into
`premiere-director-<version>.zxp`, and verifies the signature. CI
(`.github/workflows/ci.yml`) runs this automatically and attaches the ZXP to GitHub
Releases for tags matching `v*`.

## Troubleshooting

- **Panel not visible in Window > Extensions** — confirm `PlayerDebugMode` is set (see
  [Dev install](#dev-install) above) for the CSXS version this manifest targets
  (`com.adobe.CSXS.12`), then fully restart Premiere Pro (not just close/reopen the
  panel).
- **Blank panel** — open `http://localhost:7002` in Chrome to inspect the panel's
  console directly; a blank panel is almost always a JS error visible there, or a
  signed ZXP that was built from a `dist/` containing symlinks.
- **"Not running inside a CEP host"** — the panel was opened outside Premiere (e.g. in
  a browser tab); `CepAdapter` requires `window.__adobe_cep__`, which only exists
  inside the CEP runtime.
- **Silence/Director analysis fails immediately** — check that `wavPresetPath` in
  Settings points at a real `.epr` file; see
  [The missing `.epr` preset](#the-missing-epr-preset).
- **Director produces no speakers / diarization errors** — verify the
  `sherpa-onnx` binary and both model paths in Settings; `diarize()` throws explicitly
  if the binary exits non-zero or produces zero segments.

## Status and known gaps

- **Not yet run against live Premiere Pro.** Every claim above about what Silence and
  Director *do* describes the implemented, unit-tested logic — it has not been
  exercised end-to-end inside Premiere. [docs/integration-checklist.md](docs/integration-checklist.md)
  is the manual protocol for that verification and lists specific risk areas found in
  code review (numeric/boolean coercion on `TrackItem.remove`, `seq.end`'s
  representation, QE-vs-DOM track index alignment, the `app.encoder.ENCODE_ENTIRE`
  constant, and `TrackItem.nodeId` stability) that are expected to need fixes once run.
- **`assets/pd-wav-16k-mono.epr` does not exist yet** — see
  [The missing `.epr` preset](#the-missing-epr-preset). Nothing that needs audio
  export works until it's produced and configured.
- **No UXP port** — CEP 12 only, today; see
  [The CEP-to-UXP transition](#the-cep-to-uxp-transition).
- **No LLM provider implementation** — `providers/types.ts` defines the `LlmProvider`
  contract for v1.x, but nothing implements it in v1; there is no free-text "ask the
  AI to edit this" feature yet.

## Contributing

See [docs/providers.md](docs/providers.md) if you want to add a transcription, LLM,
separation, or generation provider — it covers the contract, the audit-log
requirement, and the PR checklist. See [docs/privacy.md](docs/privacy.md) for the
data-handling rules any new network-touching code must follow.

## License

[MIT](LICENSE) © 2026 Premiere Director contributors
