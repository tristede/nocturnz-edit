# Media Generation Provider Interface

**Status:** Interface-only (no reference implementation in v1.0)

## Overview

The media generation provider interface enables generating images or video clips from text prompts. Providers can leverage local diffusion models, cloud APIs, or specialized generation services to create visual media assets within the editing workflow.

## Interface Definition

See `providers/types.ts` for the `GenerationProvider` interface:

```typescript
interface GenerationProvider {
  info: ProviderInfo;
  generate(prompt: string, kind: 'image' | 'video'): Promise<string>;
}
```

The method returns the file path to the generated media asset (image or video file).

## How to Implement a Generation Provider

1. **Implement the GenerationProvider interface:**
   - Provide `info: ProviderInfo` with `id`, `displayName`, `kind: 'generation'`, and `networkEndpoints`
   - Implement `generate(prompt: string, kind: 'image' | 'video'): Promise<string>`

2. **Register ProviderInfo:**
   - Use a unique `id` (e.g., 'stable-diffusion-local', 'dall-e-3', 'runway-gen2')
   - List API endpoints for cloud providers (empty array for local-only providers)
   - Document supported image formats (PNG, JPG) and video formats (MP4, WebM)

3. **Route downloads and API calls through audit log:**
   - Import `appendAudit` from `panel/src/audit/log.ts`
   - Log model downloads, API calls, and generated file locations
   - Use purpose 'media-generation' for all audit entries
   - Return the full path to the generated output file in the panel's managed asset directory

## Common Implementations

Candidates for future implementations include:
- **Stable Diffusion** — Open-source, local/self-hosted GPU option
- **DALL-E 3** — OpenAI cloud API, high-quality images
- **Midjourney** — Community API access for premium generation
- **Runway Gen-2** — Video generation, cloud-only
- **Pika Labs** — Real-time video generation via API
