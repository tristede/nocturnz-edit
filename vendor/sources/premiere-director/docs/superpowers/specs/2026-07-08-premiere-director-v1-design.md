# Premiere Director v1 — Design

**Date:** 2026-07-08
**Status:** Approved
**License:** MIT (no vendor branding; community-owned)

## 1. Summary

Premiere Director is an open-source CEP extension panel for Adobe Premiere Pro that acts
as an AI editing assistant operating directly on the user's open project. v1 delivers:

1. Panel skeleton + ExtendScript bridge with a typed edit-operation schema and executor.
2. Silence / jump-cut removal (fully local).
3. Automatic camera switching for stacked multi-camera timelines, driven by local
   transcription + speaker diarization and a deterministic rule engine.

Everything else in the long-term vision (prompt-based LLM editing, captions, stem
separation, media generation) is deferred: provider interfaces are defined and
documented in v1, implementations come later.

## 2. Key research findings that shaped this design

These were verified against Adobe docs, Adobe staff forum answers, and shipping tools
(July 2026):

- **CEP 12 is the final CEP release.** Adobe superseded CEP with UXP in Premiere 25.6
  and plans to remove CEP support roughly a calendar year later (~Premiere 27).
  ExtendScript is committed only through ~September 2026 but continues to function in
  Premiere 26.x. UXP for Premiere is GA but **lacks razor, add-track, and caption-write
  APIs** — the exact APIs this project needs. Decision: **build on CEP 12 +
  ExtendScript + QE DOM now, behind a host-adapter seam that enables a UXP port later.**
- **No API exists (ExtendScript, QE, UXP, or C++ SDK) to create multicam sequences or
  set the active multicam angle.** Confirmed by Adobe staff. Decision: camera switching
  uses the **stacked-tracks pattern** — each camera on its own video track, razor all
  tracks at switch points, enable/disable segments — the same approach used by shipping
  tools (e.g. AutoPod).
- **Premiere's built-in transcription is not readable from any API**, and no caption
  track can be created programmatically. Decision: run our own ASR (whisper.cpp)
  on exported audio; captions deferred (MOGRT-based when built).
- **CEP 12 embeds Node.js 17.7.1 in-process** (`--enable-nodejs --mixed-context`).
  Decision: no separate bundled Node service; file I/O, WAV analysis, and spawning
  whisper.cpp happen in the panel's Node context. A sidecar process may be introduced
  later only if something outgrows Node 17.
- Proven, documented APIs cover the rest: `app.encoder.encodeSequence` (WAV export),
  `trackItem.remove(true, …)` (ripple delete), QE `track.razor(timecode)`,
  `app.project.importFiles`, `track.insertClip/overwriteClip`, full read access to
  sequence/track/clip structure, `sequence.importMGT`.

## 3. Architecture

Three layers in one CEP extension package:

```
/panel        TypeScript + React UI, bundled with Vite (targets Chromium 99 / Node 17)
  /src
    /adapters     HostAdapter interface + CepExtendScriptAdapter
    /operations   edit-operation JSON schema, validation, batch builder
    /director     camera-switching rule engine (pure TS, unit-tested)
    /silence      WAV parsing + RMS/dBFS silence detection (pure TS)
    /asr          whisper.cpp + diarization orchestration (spawns binaries)
    /audit        outbound-network audit log (empty in v1; infrastructure only)
    /ui           React components
/host           ExtendScript bridge: single executor entry point + QE helpers
/providers      Provider interfaces (TranscriptionProvider implemented;
                LlmProvider, SeparationProvider, GenerationProvider defined + stubbed)
/templates      (reserved for open caption MOGRTs, v1.x)
/docs           install guide, provider extension guide, privacy model, specs
/scripts        dev-install (PlayerDebugMode symlink), ZXP packaging
/.github        CI: build, test, package ZXP on tag
```

### 3.1 Panel (frontend)

- TypeScript + React + Vite. No UI framework beyond React; styles follow Premiere's
  dark theme via CEP host-environment colors.
- Node 17 enabled in-process via manifest `CEFCommandLine`:
  `--enable-nodejs --mixed-context --allow-file-access --allow-file-access-from-files`.
- Manifest targets `PPRO` host, CSXS 12 runtime; tested against Premiere Pro 2026 (26.x).

### 3.2 Host bridge (ExtendScript)

- `/host/index.jsx` exposes one mutation entry point: `PD_execute(operationsJson)` and a
  small set of read functions (`PD_getSequenceInfo()`, `PD_exportAudio(presetPath, outPath)`).
- All Premiere DOM and QE DOM knowledge lives here. Results return as JSON strings with
  `{ok, applied, failedAt, error}` so the panel knows exactly which operation in a batch
  failed and what was already applied (Premiere's undo stack covers rollback; each batch
  is a single user-visible action where the API allows).

### 3.3 Host adapter seam (UXP migration strategy)

The panel never calls `evalScript` directly. It calls a `HostAdapter` interface:

```ts
interface HostAdapter {
  getSequenceInfo(): Promise<SequenceInfo>;        // tracks, clips, timebase, in/out
  exportAudio(opts: AudioExportOptions): Promise<string>; // path to rendered WAV
  applyOperations(batch: OperationBatch): Promise<ApplyResult>;
}
```

v1 ships `CepExtendScriptAdapter`. When Adobe lands razor/add-track APIs in UXP, a
`UxpAdapter` implements the same interface and nothing above the seam changes. This is
the entire migration plan; docs state it explicitly for contributors.

## 4. Edit-operation schema

A closed, whitelisted set of JSON operations — never code. v1 operations:

- `razorAll { timeTicks }` — razor every unlocked video+audio track at a time (QE DOM).
- `razorTrack { trackType, trackIndex, timeTicks }`
- `rippleDelete { trackType, trackIndex, clipIndexOrNodeId }` — `trackItem.remove(true, true)`.
- `setClipEnabled { trackType, trackIndex, clipIndexOrNodeId, enabled }`
- (read-side data comes from `getSequenceInfo`, not operations)

Rules:
- Every batch is validated against the JSON schema in the panel **before** crossing the
  bridge. Invalid batches never reach ExtendScript.
- Clip references use `nodeId` where available, falling back to index-at-snapshot with a
  staleness check (sequence structure hash) so a changed timeline aborts safely instead
  of cutting the wrong clip.
- This schema is the future LLM contract: when prompt-based editing arrives, the model
  emits only these operations. That constraint is a v1 design decision, not an
  afterthought.

## 5. Feature: silence / jump-cut removal

Pipeline (100% local):

1. **Export**: `app.encoder.encodeSequence(seq, tmpWav, wavPreset.epr, workArea)` —
   bundled mono 16-bit/16 kHz WAV `.epr` preset; output to the extension's temp dir.
2. **Analyze** (pure TS in Node): parse WAV directly (no ffmpeg), windowed RMS→dBFS,
   configurable: threshold (dBFS), minimum silence duration, padding before/after
   speech, minimum kept-segment length.
3. **Preview**: panel lists proposed cut ranges with count + total time removed; user
   can toggle individual ranges.
4. **Apply**: compile to `razorAll` + `rippleDelete` batch → executor. Nothing mutates
   without explicit user confirmation.

## 6. Feature: automatic camera switching

**Prerequisite (documented in the UI):** cameras synced and stacked on V1–Vn (one camera
per track) with program/dialogue audio on the sequence. The panel verifies ≥2 video
tracks with clips and warns otherwise.

Pipeline:

1. **Export audio** (same as silence removal).
2. **Transcribe**: whisper.cpp with word-level timestamps. Models download on first use
   to the extension data dir (explicit, logged URL — not bundled in the ZXP).
3. **Diarize**: sherpa-onnx speaker diarization (segmentation + embedding, local ONNX)
   as primary; whisper.cpp tinydiarize as fallback (English-only, lower fidelity).
   Output: utterances `{tStart, tEnd, speakerId, text}`.
4. **Map**: panel lists detected speakers with a few audio-snippet playbacks each; user
   assigns each speaker to a video track (camera), may designate one track as a wide
   shot covering everyone, and may leave a speaker unassigned (= off-camera).
5. **Direct**: the **director engine** (pure TS module, no I/O) converts utterances +
   mapping into switch points using these rules:
   - **Duration threshold:** a speaker's contribution triggers a cut only if their
     continuous speech (looking forward, bridging intra-speaker gaps < 300 ms) exceeds
     1.0 s. Shorter remarks are ignored.
   - **Off-camera hold:** if the current speaker's camera is live and an unassigned (or
     sub-threshold) speaker interjects, hold the current camera. A speaker on no camera
     never triggers a switch.
   - **Interrupt rule:** if Speaker A is cut off mid-utterance by Speaker B, hold on A
     unless B exceeds the duration threshold.
   - **Minimum switch spacing:** never cut more frequently than every 1.0 s.
   - **Overlap/crosstalk:** when multiple mapped speakers talk simultaneously, prefer
     the designated wide shot if one exists; otherwise stay with the dominant speaker
     (longest continuous speech in the overlap window), alternating to other speakers'
     cameras no more often than the 1.0 s spacing allows.
   - All thresholds are configurable in the UI; defaults as above.
6. **Preview**: switch-point list/timeline in the panel (time, from-camera, to-camera,
   triggering line of dialogue); user can delete or nudge switch points.
7. **Apply**: compile to `razorAll` at each switch point + `setClipEnabled` per track
   per segment (chosen camera enabled, others disabled).

The director engine ships with unit tests over synthetic utterance fixtures covering:
brief remarks, interrupts, off-camera speakers, rapid exchanges, overlapping speech,
single-speaker monologue, and threshold boundary cases.

## 7. Providers

`/providers` defines clean interfaces so the community can add backends:

- `TranscriptionProvider` — **implemented in v1** (`WhisperCppProvider`, local).
- `LlmProvider`, `SeparationProvider`, `GenerationProvider` — interfaces + docs only in
  v1; no implementations. Each interface includes: capability declaration, explicit
  endpoint declaration (for the audit log), and key storage contract (keys live in
  local extension storage only; never in the repo, never hardcoded).

## 8. Privacy & network policy

- v1 makes **zero network calls** except one-time ASR model downloads (explicit URL,
  user-initiated, logged).
- The outbound-call audit log ships in v1 (JSONL in the extension data dir + viewer in
  settings) even though it stays nearly empty — future cloud providers must route
  through it.
- Only derived data (audio exports, transcripts, metadata) ever leaves the panel even
  in future versions; full footage never uploads. Documented in `/docs/privacy.md`.
- No telemetry of any kind in v1; any future analytics must be opt-in and documented.

## 9. Install, packaging, CI

- **Dev:** `scripts/dev-install.sh` symlinks the build into the user CEP extensions dir
  and sets `PlayerDebugMode=1` on `com.adobe.CSXS.12` (macOS plist / Windows registry).
- **Release:** ZXPSignCmd with a self-signed cert; ZXP attached to GitHub Releases.
  Docs note admin-level install and the symlink-in-ZXP signing pitfall (sign per
  platform, no symlinks inside the package).
- **CI:** GitHub Actions — lint, unit tests, build panel, package ZXP on tag.
- **Docs:** README (build + debug install), `/docs/providers.md` (extension guide),
  `/docs/privacy.md`, and an honest note on the CEP sunset + UXP port roadmap.

## 10. Testing strategy

- **Unit (vitest, no Premiere):** director engine, silence detector, WAV parser,
  operation-schema validation, batch compiler.
- **Integration (manual, scripted):** a documented fixture project for Premiere Pro
  2026 (short stacked 3-track sequence with scripted dialogue audio) exercised via a
  checklist: bridge round-trip, WAV export, silence removal end-to-end, camera
  switching end-to-end, staleness abort, undo behavior.
- Bridge smoke test: panel dev page with buttons per host function for rapid manual
  verification inside Premiere.

## 11. Deferred (v1.x+ roadmap, interfaces ready)

- Prompt→LLM→operation-plan editing (schema already the contract).
- Transcription export (SRT/VTT) and MOGRT-based animated captions (real caption
  tracks remain API-blocked).
- Stem separation via self-hosted Demucs endpoint (PyTorch is too heavy to bundle);
  possible lighter local ONNX separator later.
- Generative media providers.
- Multicam helpers / auto-reframe (experimental scaffold only).
- UXP adapter, when Adobe lands razor/add-track APIs.

## 12. Risks

| Risk | Mitigation |
|---|---|
| CEP removed in Premiere 27 | Host-adapter seam; UXP port is the documented roadmap; v1 targets 2026 (26.x) where CEP works today (verified on the target machine). |
| QE DOM is unsupported/undocumented | Used only for razor; behavior verified in integration tests per Premiere point release; abort-safe executor. |
| Diarization quality on >2 speakers / noisy audio | User-editable preview before apply; configurable thresholds; cloud diarization provider possible later behind the interface. |
| `encodeSequence` preset/path quirks across versions | Bundled known-good `.epr`; integration test in fixture checklist. |
| Sequence changes between analysis and apply | Structure-hash staleness check aborts the batch. |
