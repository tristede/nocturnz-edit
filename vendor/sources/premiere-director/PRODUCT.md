# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Delivered as an Adobe CEP 12 extension panel: React + TypeScript running in CEP's
Chromium 99 with in-process Node 17, docked inside Premiere Pro 2026. Web design
language, not native macOS/Windows — but always inside a host application's chrome,
never a browser tab.

## Users

**Primary and effectively only user: the author, editing their own multi-camera
podcast footage.** MIT licensing and the "no vendor branding / no Adobe affiliation"
stance are a distribution posture, not evidence of an audience. Design decisions
should optimize for one expert operator who already understands the pipeline —
diarization, stacked tracks, razor/ripple semantics, frame quantization — rather
than for a stranger discovering the panel on GitHub.

Situation: mid-edit, panel docked beside a Premiere timeline holding synced camera
tracks and a dialogue take. The job is turning a raw multi-cam recording into a
usable rough cut without hand-cutting every speaker change.

## Product Purpose

Automate two editing tasks from a transcript:

- **Silence removal** — export the active sequence's audio, detect silent ranges,
  razor and ripple-delete them in one batch.
- **Director (multicam-by-editing)** — transcribe and diarize dialogue across camera
  tracks, map each detected speaker to a camera track, plan camera switches, apply
  them as razors plus per-clip enable/disable across all video tracks.

**Success is time saved on real edits:** a two-camera podcast that used to take hours
of manual cutting produces a usable rough cut in minutes, reliably enough to trust on
real footage. Not adoption metrics, not stars, not a polished install funnel.

## Positioning

Three things a neighboring tool could not truthfully copy:

1. **Stacked-track camera switching as a deliberate workaround, not a limitation.**
   No API in Premiere Pro — ExtendScript, QE, UXP, or C++ — can create a multicam
   sequence or set its active angle. Adobe staff have confirmed this gap publicly.
   Director cuts between plain stacked video tracks with razor + `setClipEnabled`
   because that is the only way to automate a multicam-style cut from outside the UI.
2. **A closed operation schema as the sole mutation contract.** Every timeline change
   crosses the ExtendScript bridge as one of `razorAll` / `rippleDelete` /
   `setClipEnabled` / `setTrackMute`, validated before execution. Freeform script is
   never sent to Premiere. This is a safety property and an architectural commitment.
3. **Fully local by construction.** Transcription and diarization shell out to
   user-supplied local binaries. Footage never leaves the machine. Exactly one
   network call exists in the product — the user-initiated model download — and it is
   audit-logged.

## Operating Context

- Runs as a docked panel inside Premiere Pro 2026 (26.x) on macOS or Windows,
  alongside a sequence the user is actively editing.
- Three surfaces today: **Silence**, **Director**, **Settings**.
- Real working footage is ~23.976 fps, two-camera podcast/interview material with
  synced tracks (one camera per video track) and A/V-linked dialogue.
- ASR is external: `whisper.cpp`'s `whisper-cli` plus a GGML model, and `sherpa-onnx`
  offline speaker diarization plus its segmentation and embedding models. Binary and
  model paths are configured in Settings and persisted to `localStorage`.
- Audio for analysis is exported through Premiere's own encoder using
  `assets/pd-wav-16k-mono.epr` (16 kHz mono 16-bit WAV).
- Audit log lives at `~/.premiere-director/audit.jsonl`.
- Development: `npm run build`, `./scripts/dev-install.sh`, CEF remote debug on
  `http://localhost:7002` for hot-reload and host-function evaluation.

## Capabilities and Constraints

**Confirmed capabilities**

- Silence detection and batched razor + ripple-delete on single-track recordings.
- Transcription, diarization, speaker→camera mapping (including camera-mic
  auto-assign and speaker identification aids), camera-switch planning, and
  application across all video tracks.
- Re-applying a camera assignment without re-cutting; a "Start over" reset that
  clears the tab for the next timeline.
- Staleness detection — an analyzed plan aborts if the sequence changed underneath it.

**Hard constraints that future work must not relitigate**

- No API of any kind can create multicam sequences or set the active angle. Stacked
  tracks are the mechanism, permanently, until Adobe ships one.
- Utterances must be built from diarization segments with whisper text attached, never
  from whisper segments with a majority speaker. Whisper segments span speaker turns;
  this bug shipped once already.
- sherpa-onnx diarization requires a speaker-count hint or it over-splits badly.
- Razor cuts land on frame boundaries; any time compared against razored clip edges
  must be quantized via `quantizeToFrame(t, fps)` first.
- `sequence.exportAsMediaDirect` is synchronous and freezes Premiere's UI for the
  duration of the export. Any surface that triggers analysis must account for the host
  application being unresponsive, not just the panel.
- ExtendScript host code is ES3 only. The panel is modern TS/React; the host is not.
- Zero network calls except the user-initiated model download. No telemetry ever.
- CEP is end-of-life (dies around Premiere 27; ExtendScript support ends ~Sept 2026).
  A `HostAdapter` seam exists so a UXP adapter can replace CEP without rewriting the
  panel. Anything built now should not deepen the CEP coupling past that seam.

**Committed direction**

- **Prompt→LLM edit planning is core to the product's identity, not a maybe.** The
  operation schema is explicitly the future LLM contract; an LLM proposes a batch, the
  same validator gates it, the same three primitives execute it. Product and interface
  decisions should be made with that future in view. (`validateBatch` must sanitize
  extra op keys before this ships.)

**Explicitly undecided**

- MOGRT captions + SRT export, stem separation via a self-hosted endpoint, and the UXP
  adapter have interfaces in `providers/` but no committed timeline.
- Public GitHub publication: CI packages a ZXP on `v*` tags, but there is no remote and
  no committed release. Treat public distribution as unresolved.

## Brand Commitments

- Name: **Premiere Director**. MIT licensed.
- No vendor branding. No affiliation with Adobe, OpenAI, Hugging Face, or any AI/model
  vendor — the product is a client that shells out to tools the user installs.
- Local-first and privacy-preserving is a stated product promise, documented in
  `docs/privacy.md`, not merely an implementation detail.

## Evidence on Hand

**Real**

- Live-verified on this machine against Premiere Pro 2026 with two-camera podcast
  footage: bridge round-trip, WAV export via `assets/pd-wav-16k-mono.epr`, whisper +
  diarization, the full director pipeline end-to-end, and camera-mic auto-assign
  prerequisites (`setMute` / `isMuted`).
- 84 passing unit tests over all pure logic; `npx tsc --noEmit` clean.
- `assets/pd-wav-16k-mono.epr` exists in the repo (6.1 KB).
- Approved design spec and executed build plan under `docs/superpowers/`.
- Public Adobe community threads confirming the multicam API gap, cited in `README.md`.

**Absent — must not be fabricated**

- No users besides the author, no testimonials, no case studies, no press, no adoption
  or performance benchmarks, no pricing, no published release.
- Razor/ripple frame accuracy on drop-frame timecode is *not* fully verified; `_pdSmpte`
  assumes non-drop. QE DOM razor behavior is undocumented. Items 9–13 in
  `docs/integration-checklist.md` (ripple coercion, `seq.end` representation, QE/DOM
  track index alignment, `ENCODE_ENTIRE`, `TrackItem.nodeId` stability) remain open.

**Known documentation drift (recorded, not repaired here)**

- `README.md` still states v1 "has not yet been run against a live copy of Premiere Pro"
  and that `assets/pd-wav-16k-mono.epr` "does not exist yet". Both are stale; the file
  exists and the pipeline has been live-verified.
- `docs/integration-checklist.md` still says "67 tests" and "has not been run yet".

## Product Principles

1. **Every timeline mutation is a validated primitive.** No freeform script crosses the
   bridge — not from the panel, and not later from an LLM. The schema is the contract.
2. **Destructive is different from analytical.** Analysis is reversible and cheap;
   razoring someone's timeline is neither. The two must never be confusable in an
   interface, and applying edits must always be a deliberate, separate act.
3. **Local by default, and visibly so.** The user should be able to tell at a glance
   that nothing left the machine. The single network call stays explicit and logged.
4. **Trust the operator, but never their assumptions about state.** The user is an
   expert; do not over-explain. But always verify the sequence still matches the plan,
   and fail loudly with a readable error rather than mutating on stale data.
5. **Build against the seam, not the host.** CEP is dying. Anything that assumes CEP
   beyond `HostAdapter` is debt with a known expiry date.
