# Integration checklist (run per Premiere point release)

Everything in this repo below the ExtendScript bridge (`host/index.jsx`) is covered by
unit tests that run against fixtures and fakes — 67 tests, all passing, none of them
touch a real copy of Premiere Pro. That is deliberate: the pure-logic layers (silence
detection, camera-cut planning, WAV parsing, operation validation, settings, audit log)
are fully exercised without Premiere. What is **not** covered by unit tests is the
ExtendScript/QE surface itself — object shapes, coercion rules, and timecode formats
that only exist inside a running Premiere Pro process. This checklist is the manual
protocol that closes that gap. It has not been run yet; every item below is an
open verification, not a confirmed pass.

Fixture: 3 video tracks (V1 A-cam, V2 B-cam, V3 wide), same 60s take synced, A/V linked
dialogue on A1; second fixture: single-track talking head with long pauses.

1. Bridge: PD_ping → "pong"; PD_getSequenceInfo lists all tracks/clips with correct times.
2. Export: Analyze silence produces a WAV in tmp; file opens; sample rate 16k mono.
3. Silence: on the talking-head fixture, detected ranges match audible pauses (±0.2s);
   Apply razors at boundaries and ripple-deletes silent clips; linked audio follows;
   ONE Edit > Undo step per applied batch restores (document actual undo granularity).
4. Razor accuracy: cuts land on the expected frame at 23.976/29.97 (drop-frame!) and 25fps.
   If off on drop-frame, fix `_pdSmpte` separator/rounding (Task 10 note).
5. Director: analyze detects 2+ speakers; mapping UI lists tracks; plan produces sane
   switches; apply razors all camera tracks and enables exactly one camera per segment.
6. Staleness: analyze, then manually move a clip, then Apply → aborts with "sequence changed".
7. Failure surface: point whisper path at a bogus binary → readable error in panel, no mutation.
8. dist/ contains no symlinks; packaged ZXP verifies with ZXPSignCmd -verify.

## Additional items surfaced by earlier code review (not yet live-verified)

These were flagged as risk areas during code review of `host/index.jsx` and the
adapters that call it. They are speculative until run against a live sequence —
add a pass/fail line for each when this checklist is executed.

9. `remove(1,1)` coercion: `_pdGetClip(...).remove(1, 1)` in `PD_execute`'s
   `rippleDelete` branch passes ExtendScript numeric literals `1` where the
   `TrackItem.remove(ripple, alignToVideo)` signature may expect booleans in some
   Premiere versions. Confirm ripple-delete actually ripples (does not leave a gap)
   and that alignment behaves as expected on both single- and multi-track sequences.
10. `seq.end` representation: `PD_getSequenceInfo` divides `seq.end` by
    `254016000000` (ticks-per-second) assuming `seq.end` is a raw ticks number.
    Confirm `seq.end` is not itself a `Time`-like object in the installed Premiere
    version (which would need `.seconds` or `.ticks` access instead of direct
    division) — if it is, `endSec` will be silently wrong.
11. QE/DOM track index alignment: `_pdRazorAll` assumes
    `qe.project.getActiveSequence().getVideoTrackAt(i)` /
    `.getAudioTrackAt(i)` line up 1:1 with `seq.videoTracks[i]` /
    `seq.audioTracks[i]` from the DOM API. Confirm this holds when tracks have been
    hidden, locked, or reordered — a QE/DOM index mismatch would razor the wrong track.
12. `app.encoder.ENCODE_ENTIRE` and `exportAsMediaDirect`: `PD_exportAudio` calls
    `seq.exportAsMediaDirect(outPath, presetPath, app.encoder.ENCODE_ENTIRE)`.
    Confirm this constant exists and resolves to the expected enum value in
    Premiere Pro 2026, and that the exported file actually lands at `outPath`
    (some Premiere versions silently append an extension or write to a
    different resolved path).
13. `TrackItem.nodeId`: `_pdTrackInfo` reads `c.nodeId || String(i)` as a stable
    per-clip identity. Confirm `nodeId` exists on `TrackItem` in this Premiere
    version and remains stable across a save/reopen cycle (if it does not exist
    or changes, silence/director staleness detection and clip re-identification
    degrade to positional indexing only).

Record the actual Premiere Pro build number and OS this checklist was run against,
and file a fix for anything in items 1-13 that fails before calling v1 done.
