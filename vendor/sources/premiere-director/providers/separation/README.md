# Audio Separation Provider Interface

**Status:** Interface-only (no reference implementation in v1.0)

## Overview

The audio separation provider interface enables extracting isolated vocal, drum, bass, and other stem tracks from mixed audio. This is useful for post-processing, re-mixing, or isolating dialogue for independent processing.

## Interface Definition

See `providers/types.ts` for the `SeparationProvider` interface:

```typescript
interface SeparationProvider {
  info: ProviderInfo;
  separate(wavPath: string, stems: Array<'vocals' | 'drums' | 'bass' | 'other'>): Promise<string[]>;
}
```

The method returns an array of output WAV file paths in the same order as the requested stems.

## How to Implement a Separation Provider

1. **Implement the SeparationProvider interface:**
   - Provide `info: ProviderInfo` with `id`, `displayName`, `kind: 'separation'`, and `networkEndpoints`
   - Implement `separate(wavPath: string, stems: Array<...>): Promise<string[]>`

2. **Register ProviderInfo:**
   - Use a unique `id` (e.g., 'spleeter-local', 'demucs-gpu')
   - List API endpoints if using cloud processing (empty array for local-only providers)
   - Declare whether the provider requires GPU, CPU, or network resources

3. **Route network/model downloads through audit log:**
   - Import `appendAudit` from `panel/src/audit/log.ts`
   - Log model downloads and any network API calls with purpose 'stem-separation'
   - Output stem files to a temporary directory managed by the panel

## Common Implementations

Candidates for future implementations include:
- **spleeter** — Fast, CPU-friendly, 2-4 stems
- **Demucs** — GPU-accelerated, higher quality, 4 stems
- **NVIDIA Splitter** — Cloud API, state-of-the-art quality
