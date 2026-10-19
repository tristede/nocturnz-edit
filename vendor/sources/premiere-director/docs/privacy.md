# Privacy

Premiere Director v1 is designed to run fully local. This document describes exactly
what leaves your machine, when, and how it is logged.

## What is local

Everything except one explicit, user-initiated download:

- Sequence inspection (`PD_getSequenceInfo`) runs inside Premiere via ExtendScript/QE
  and never touches the network.
- Audio export for silence detection and transcription (`CepAdapter.exportAudio`,
  `PD_exportAudio`) renders a WAV to a local temp path using Premiere's own encoder.
- Silence detection (`panel/src/silence/detect.ts`) is pure local signal processing
  over that WAV.
- Transcription (`panel/src/asr/whisper.ts`) shells out to a user-supplied
  `whisper.cpp` (`whisper-cli`) binary and model file, both configured in Settings.
  No audio or text is sent anywhere by this step.
- Speaker diarization (`panel/src/asr/diarize.ts`) shells out to a user-supplied
  `sherpa-onnx` offline-speaker-diarization binary and models, same as above.
- Editing operations (razor, ripple delete, enable/disable clip) are applied to the
  Premiere project directly via `PD_execute` in `host/index.jsx`.

**Full footage never leaves the machine.** Only derived data — a rendered scratch WAV
and its resulting transcript — is ever eligible to leave the machine, and in v1 even
that never does: it's used locally and discarded/kept in temp storage.

## The one network call: model download

The only network request v1 ever makes is the explicit "Download base.en model"
button in Settings (`panel/src/App.tsx` → `SettingsForm.downloadModel`,
implemented in `panel/src/asr/download.ts`). It fetches
`ggml-base.en.bin` from Hugging Face (`https://huggingface.co/ggerganov/whisper.cpp/...`)
to `~/.premiere-director/ggml-base.en.bin`. It only runs when you click the button —
never automatically, never on startup, never as a side effect of analysis.

## Audit log

Every network call in this codebase is required to write an entry to the audit log
before the request is made (see `panel/src/audit/log.ts`). The model download does
this today; it is the pattern any future network-touching feature must follow.

- **Location**: `<extension data dir>/audit.jsonl` — currently
  `~/.premiere-director/audit.jsonl` (same directory the model download uses).
- **Format**: one JSON object per line (JSONL), each with:
  - `ts` — ISO 8601 timestamp
  - `url` — the exact URL requested
  - `purpose` — a short human-readable reason (e.g. `"whisper model download"`)
  - `destFile` — the local path data was written to, when applicable

The log is append-only and best-effort: `parseAuditLog` tolerates a truncated final
line (e.g. if the process was killed mid-write) by skipping it rather than throwing.

## Future cloud providers

`providers/types.ts` defines the contract every provider (transcription, LLM,
separation, generation) must implement. Every provider declares
`networkEndpoints: string[]` on its `ProviderInfo` — an empty array means fully local;
a non-empty array is a binding declaration of every host it may contact. Any future
provider that talks to a network service:

- must declare its endpoints in `networkEndpoints`,
- must route every outbound call through `appendAudit` before the request fires,
- must never embed or hardcode API keys — credentials are supplied through panel
  Settings only, and
- must not receive raw project footage; only the minimum derived data required for
  its operation (a transcript, a WAV clip, etc.) is ever eligible to be sent, and only
  once the corresponding feature is actually enabled and configured by the user.

See `docs/providers.md` for the implementation guide.
