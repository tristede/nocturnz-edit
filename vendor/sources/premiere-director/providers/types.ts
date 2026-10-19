// Premiere Director provider contracts. Implementations live beside these types;
// the panel imports from here. Every provider MUST declare its network endpoints
// so calls can be routed through the audit log, and MUST NOT hardcode credentials.

export interface ProviderInfo {
  id: string;               // e.g. 'whisper-cpp'
  displayName: string;
  kind: 'transcription' | 'llm' | 'separation' | 'generation';
  networkEndpoints: string[]; // [] means fully local
}

export interface UtteranceLike { startSec: number; endSec: number; speakerId: string; text: string; }

export interface TranscriptionProvider {
  info: ProviderInfo;
  transcribe(wavPath: string): Promise<UtteranceLike[]>;
}

// Defined for v1.x — NOT implemented in v1. The LLM contract is the closed operation
// schema in panel/src/operations/schema.ts: providers return operation batches, never code.
export interface LlmProvider {
  info: ProviderInfo;
  planOperations(prompt: string, sequenceJson: string): Promise<unknown /* OperationBatch, validated by caller */>;
}

export interface SeparationProvider {
  info: ProviderInfo;
  separate(wavPath: string, stems: Array<'vocals' | 'drums' | 'bass' | 'other'>): Promise<string[]>; // stem file paths
}

export interface GenerationProvider {
  info: ProviderInfo;
  generate(prompt: string, kind: 'image' | 'video'): Promise<string>; // downloaded media path
}
