# Whisper CPP Transcription Provider

**Status:** Implemented

## Overview

The whisper-cpp provider uses the [whisper.cpp](https://github.com/ggerganov/whisper.cpp) project to perform local speech-to-text transcription. This provider implements the `TranscriptionProvider` interface defined in `providers/types.ts`.

## Implementation Location

- **Provider logic:** `panel/src/asr/whisper.ts` (exports `transcribe()` function and `parseWhisperJson()`)
- **CLI binary:** `whisper-cli` from whisper.cpp project
- **Model:** `ggml-base.en.bin` (base English model, downloadable via Settings panel)

## How to Implement a New Transcription Provider

1. **Implement the TranscriptionProvider interface** from `providers/types.ts`:
   - Provide `info: ProviderInfo` with `id`, `displayName`, `kind: 'transcription'`, and `networkEndpoints`
   - Implement `transcribe(wavPath: string): Promise<UtteranceLike[]>` method

2. **Register ProviderInfo:**
   - Declare your provider's `ProviderInfo` with unique `id` (e.g., 'my-transcriber')
   - Set `displayName` for UI presentation
   - List all external API endpoints in `networkEndpoints` array (empty array for fully local providers)

3. **Route downloads through audit log:**
   - Import `appendAudit` from `panel/src/audit/log.ts`
   - Call `appendAudit(logPath, { ts: new Date().toISOString(), url: downloadUrl, purpose: 'model-download', destFile: modelPath })` when downloading provider dependencies

## Whisper CLI Contract

The whisper-cli binary accepts the following command structure:

```
whisper-cli -m <model-path> -f <wav-file> -oj -of <output-base>
```

- `-m` — Path to GGML model file (e.g., `ggml-base.en.bin`)
- `-f` — Path to input WAV audio file
- `-oj` — Output JSON format
- `-of` — Base path for output file (produces `<outbase>.json`)

The JSON output contains a `transcription` array with segments:
```json
{
  "transcription": [
    { "offsets": { "from": 0, "to": 3000 }, "text": "Hello world" }
  ]
}
```

## Model Installation

The base English model is 140 MB and can be downloaded via the Premiere Director Settings panel. The panel manages the download location and calls the audit log appropriately.
