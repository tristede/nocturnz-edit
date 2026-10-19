import type { SequenceInfo } from '../operations/model';
import type { OperationBatch } from '../operations/schema';
import { structureHash } from '../lib/hash';

export function sequenceHash(info: SequenceInfo): string {
  return structureHash({ v: info.videoTracks, a: info.audioTracks });
}

export interface ApplyResult { ok: boolean; applied: number; failedAt?: number; error?: string; }
export interface HostAdapter {
  ping(): Promise<boolean>;
  getSequenceInfo(): Promise<SequenceInfo>;               // throws Error on {error} responses
  exportAudio(outPath: string, presetPath: string): Promise<string>; // resolves to path
  applyOperations(batch: OperationBatch, expectedHash?: string): Promise<ApplyResult>;
  // applyOperations validates the batch, and when expectedHash is given it refetches
  // sequence info first and aborts with {ok:false, error:'sequence changed...'} on mismatch.
}
