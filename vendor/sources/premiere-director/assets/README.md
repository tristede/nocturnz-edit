# assets/

Static assets copied verbatim into `dist/` by `scripts/build-host.mjs` (see the
`existsSync(join(root, 'assets'))` copy loop). Anything placed here ships with
the extension.

## MISSING: pd-wav-16k-mono.epr

This directory should contain `pd-wav-16k-mono.epr` — an Adobe Media Encoder
export preset used by `CepAdapter.exportAudio` (via `Settings.wavPresetPath`)
to render the sequence's scratch audio for silence detection and ASR.

It is **not present** in this commit because this task was implemented in a
headless environment with no running copy of Premiere Pro / Adobe Media
Encoder available to export a `.epr` file from. Per the Task 15 brief's own
fallback instructions, this README documents the exact settings the preset
must use so it can be produced later; do not substitute a fabricated or
placeholder binary `.epr` file.

**Task 18's integration checklist requires the real file before release.**

### How to produce it (on a machine with Premiere Pro / AME installed)

1. Open Adobe Media Encoder (or Premiere Pro's Export Media dialog).
2. Format: **Waveform Audio** (WAV).
3. Audio codec settings:
   - Sample Rate: **16000 Hz**
   - Channels: **Mono**
   - Sample Size: **16-bit**
4. Save the export settings as a preset named `pd-wav-16k-mono`.
5. AME/Premiere writes presets to the user preset directory (typically
   `~/Documents/Adobe/Adobe Media Encoder/<version>/Presets/` on macOS, or
   `Documents\Adobe\Adobe Media Encoder\<version>\Presets\` on Windows).
   Locate the saved `.epr` file there.
6. Copy that file into this directory as `assets/pd-wav-16k-mono.epr`.
7. Rebuild (`npm run build`) — `scripts/build-host.mjs` copies everything in
   `assets/` into `dist/`, and `Settings.wavPresetPath` should then point at
   the deployed path of this file (e.g. inside the installed extension's
   directory) so `CepAdapter.exportAudio` can pass it to Premiere's export API.

### Why these exact settings

- **16000 Hz / mono / 16-bit** matches the input format expected by
  `whisper.cpp` (`whisper-cli`) for transcription and keeps the WAV small for
  fast silence-detection parsing (`panel/src/silence/wav.ts`,
  `panel/src/silence/detect.ts`).
