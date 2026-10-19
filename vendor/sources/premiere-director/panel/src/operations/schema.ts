export type Operation =
  | { type: 'razorAll'; timeSec: number }
  | { type: 'rippleDelete'; trackType: 'video' | 'audio'; trackIndex: number; clipIndex: number }
  | { type: 'setClipEnabled'; trackType: 'video'; trackIndex: number; clipIndex: number; enabled: boolean }
  | { type: 'setTrackMute'; trackType: 'audio'; trackIndex: number; mute: boolean };

export interface OperationBatch { ops: Operation[]; }
export type ValidationResult = { ok: true; batch: OperationBatch } | { ok: false; errors: string[] };

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isIdx = (v: unknown): v is number => isNum(v) && v >= 0 && Number.isInteger(v);

function validateOp(op: unknown, i: number, errors: string[]): void {
  if (typeof op !== 'object' || op === null) { errors.push(`op[${i}]: not an object`); return; }
  const o = op as Record<string, unknown>;
  switch (o.type) {
    case 'razorAll':
      if (!isNum(o.timeSec) || o.timeSec < 0) errors.push(`op[${i}]: razorAll.timeSec must be >= 0`);
      return;
    case 'rippleDelete':
      if (o.trackType !== 'video' && o.trackType !== 'audio') errors.push(`op[${i}]: bad trackType`);
      if (!isIdx(o.trackIndex)) errors.push(`op[${i}]: bad trackIndex`);
      if (!isIdx(o.clipIndex)) errors.push(`op[${i}]: bad clipIndex`);
      return;
    case 'setClipEnabled':
      if (o.trackType !== 'video') errors.push(`op[${i}]: setClipEnabled only supports video`);
      if (!isIdx(o.trackIndex)) errors.push(`op[${i}]: bad trackIndex`);
      if (!isIdx(o.clipIndex)) errors.push(`op[${i}]: bad clipIndex`);
      if (typeof o.enabled !== 'boolean') errors.push(`op[${i}]: enabled must be boolean`);
      return;
    case 'setTrackMute':
      if (o.trackType !== 'audio') errors.push(`op[${i}]: setTrackMute only supports audio`);
      if (!isIdx(o.trackIndex)) errors.push(`op[${i}]: bad trackIndex`);
      if (typeof o.mute !== 'boolean') errors.push(`op[${i}]: mute must be boolean`);
      return;
    default:
      errors.push(`op[${i}]: unknown op type "${String(o.type)}"`);
  }
}

export function validateBatch(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (typeof input !== 'object' || input === null || !Array.isArray((input as { ops?: unknown }).ops)) {
    return { ok: false, errors: ['batch.ops must be an array'] };
  }
  const ops = (input as { ops: unknown[] }).ops;
  ops.forEach((op, i) => validateOp(op, i, errors));
  return errors.length ? { ok: false, errors } : { ok: true, batch: { ops: ops as Operation[] } };
}
