# LLM Provider Interface

**Status:** Interface-only (defined for v1.x, not implemented in v1.0)

## Overview

The LLM provider interface supports planning media operations via large language models. Providers implementing this interface generate operation batches from natural language prompts, enabling AI-assisted editing workflows.

## Interface Definition

See `providers/types.ts` for the `LlmProvider` interface:

```typescript
interface LlmProvider {
  info: ProviderInfo;
  planOperations(prompt: string, sequenceJson: string): Promise<unknown>;
}
```

The operation schema is defined in `panel/src/operations/schema.ts`. Providers MUST return validated `OperationBatch` objects; the caller validates against the closed schema.

## How to Implement an LLM Provider

1. **Implement the LlmProvider interface:**
   - Provide `info: ProviderInfo` with `id`, `displayName`, `kind: 'llm'`, and `networkEndpoints`
   - Implement `planOperations(prompt: string, sequenceJson: string): Promise<OperationBatch>`

2. **Register ProviderInfo:**
   - Use a unique `id` (e.g., 'openai-gpt4', 'anthropic-claude')
   - List API endpoints in `networkEndpoints` (e.g., `['https://api.openai.com']`)
   - Never hardcode API keys; the panel provides credentials via environment or secure storage

3. **Route network calls through audit log:**
   - Import `appendAudit` from `panel/src/audit/log.ts`
   - Log each API call with endpoint URL, purpose ('llm-planning'), and response metadata

## v1.0 Status

LLM planning is deferred to v2. The interface is stable for community extensions; any v1.0 user attempting to use an LLM provider will receive a "feature not yet available" message.
