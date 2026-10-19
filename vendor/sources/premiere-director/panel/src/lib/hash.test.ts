import { describe, expect, it } from 'vitest';
import { structureHash } from './hash';

describe('structureHash', () => {
  it('is stable regardless of key order', () => {
    expect(structureHash({ a: 1, b: [2, 3] })).toBe(structureHash({ b: [2, 3], a: 1 }));
  });
  it('differs when values differ', () => {
    expect(structureHash({ a: 1 })).not.toBe(structureHash({ a: 2 }));
  });
});
