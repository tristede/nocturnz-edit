# Writing a provider

Premiere Director's provider layer is defined in `providers/types.ts`. A provider is
a small adapter between an external tool/service and the panel's pipelines
(`panel/src/asr/*`, `panel/src/silence/*`, `panel/src/director/*`). This document is
the how-to for adding one.

## The contracts

`providers/types.ts` defines four provider kinds, each with a `ProviderInfo` plus one
method:

```ts
export interface ProviderInfo {
  id: string;               // e.g. 'whisper-cpp'
  displayName: string;
  kind: 'transcription' | 'llm' | 'separation' | 'generation';
  networkEndpoints: string[]; // [] means fully local
}

export interface TranscriptionProvider {
  info: ProviderInfo;
  transcribe(wavPath: string): Promise<UtteranceLike[]>;
}

export interface LlmProvider {
  info: ProviderInfo;
  planOperations(prompt: string, sequenceJson: string): Promise<unknown>;
}

export interface SeparationProvider {
  info: ProviderInfo;
  separate(wavPath: string, stems: Array<'vocals' | 'drums' | 'bass' | 'other'>): Promise<string[]>;
}

export interface GenerationProvider {
  info: ProviderInfo;
  generate(prompt: string, kind: 'image' | 'video'): Promise<string>;
}
```

The two providers shipped in v1 (`panel/src/asr/whisper.ts` for transcription,
`panel/src/asr/diarize.ts` for the speaker-assignment half of dialogue analysis) are
both local-binary adapters with `networkEndpoints: []` — they shell out to a
user-supplied CLI (`whisper-cli`, `sherpa-onnx`'s offline-speaker-diarization binary)
and parse its stdout/JSON. `LlmProvider`, `SeparationProvider`, and
`GenerationProvider` are defined for v1.x but have no implementation in v1 — the LLM
contract in particular is intentionally not wired up yet (see below).

## Steps to add a provider

1. **Implement the interface.** Create a file under `providers/<kind>/` (matching the
   existing `providers/transcription/`, `providers/llm/`, `providers/separation/`,
   `providers/generation/` layout) exporting an object that satisfies one of the four
   interfaces above.
2. **Declare `networkEndpoints` honestly.** If your provider is a local CLI/binary
   wrapper with no network calls, use `[]`. If it calls a hosted API, list every host
   it can reach — this array is the only place reviewers and users can see what a
   provider is allowed to talk to.
3. **No hardcoded credentials.** API keys, tokens, and secrets must come from panel
   Settings (`panel/src/lib/settings.ts` — extend the `Settings` interface and the
   Settings tab UI, following the existing `whisperBinPath`/`whisperModelPath`
   pattern), never from source, env defaults baked into the provider, or config
   files checked into the repo.
4. **Route network calls through the audit log.** Before any request your provider
   makes, call `appendAudit` (`panel/src/audit/log.ts`) with the URL, a short
   `purpose` string, and the destination file if one is written. See
   `panel/src/asr/download.ts`'s model-download flow for the reference pattern.
5. **Respect the LLM output contract.** `LlmProvider.planOperations` must return data
   that validates against the closed operation schema in
   `panel/src/operations/schema.ts` (`validateBatch`) — a batch of `razorAll`,
   `rippleDelete`, or `setClipEnabled` operations, nothing else. An LLM provider
   returns an `OperationBatch`, never code, never a script, never a direct API call
   into Premiere. `CepAdapter.applyOperations` re-validates every batch before it
   reaches `host/index.jsx`, so a provider that returns anything outside the schema
   simply fails validation rather than executing.
6. **Add tests.** Follow the pattern in `panel/src/asr/whisper.test.ts` and
   `panel/src/asr/diarize.test.ts` — unit test the parsing/mapping logic against
   fixed fixture output, with the actual binary invocation behind an injectable
   `Runner` (see `panel/src/asr/run.ts`).

## PR checklist for a new provider

- [ ] Implements the correct interface from `providers/types.ts` exactly.
- [ ] `networkEndpoints` lists every host contacted, or is `[]` if none.
- [ ] No hardcoded API keys, tokens, or secrets anywhere in the diff.
- [ ] Any network call is preceded by an `appendAudit` call.
- [ ] If an `LlmProvider`: output is validated against
      `panel/src/operations/schema.ts` before being trusted, and the PR explains how
      the provider is constrained to the operation schema (prompt design, output
      parsing, post-validation) rather than freeform code execution.
- [ ] Settings UI updated if the provider needs new configuration (binary path,
      model path, API key field).
- [ ] Unit tests cover the provider's parsing/transformation logic with fixture data.
- [ ] `docs/privacy.md` updated if the provider introduces a new network destination.
