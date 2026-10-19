import { describe, expect, it } from 'vitest';
import { validateBatch } from './schema';

describe('validateBatch', () => {
  it('accepts a valid batch', () => {
    const r = validateBatch({
      ops: [
        { type: 'razorAll', timeSec: 1.5 },
        { type: 'rippleDelete', trackType: 'video', trackIndex: 0, clipIndex: 2 },
        { type: 'setClipEnabled', trackType: 'video', trackIndex: 1, clipIndex: 0, enabled: false },
      ],
    });
    expect(r.ok).toBe(true);
  });
  it('accepts setTrackMute for audio tracks and rejects it for video or missing mute', () => {
    expect(validateBatch({ ops: [{ type: 'setTrackMute', trackType: 'audio', trackIndex: 1, mute: true }] }).ok).toBe(true);
    expect(validateBatch({ ops: [{ type: 'setTrackMute', trackType: 'video', trackIndex: 0, mute: true }] }).ok).toBe(false);
    expect(validateBatch({ ops: [{ type: 'setTrackMute', trackType: 'audio', trackIndex: 0 }] }).ok).toBe(false);
  });
  it('rejects unknown op types (closed set)', () => {
    const r = validateBatch({ ops: [{ type: 'evalScript', code: 'alert(1)' }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/unknown op type/i);
  });
  it('rejects negative times and indices, non-arrays, missing fields', () => {
    expect(validateBatch({ ops: [{ type: 'razorAll', timeSec: -1 }] }).ok).toBe(false);
    expect(validateBatch({ ops: [{ type: 'rippleDelete', trackType: 'video', trackIndex: -1, clipIndex: 0 }] }).ok).toBe(false);
    expect(validateBatch({ ops: 'nope' }).ok).toBe(false);
    expect(validateBatch({ ops: [{ type: 'setClipEnabled', trackType: 'video', trackIndex: 0, clipIndex: 0 }] }).ok).toBe(false);
  });
});
