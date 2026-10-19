import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { readPoint } = createRequire(import.meta.url)('../plugin/point.cjs');

test('les coordonnées Motion réelles de Premiere 27 sont des tableaux enveloppés', () => {
  assert.deepEqual(readPoint({ value: [0.35, 0.5] }), { x: 0.35, y: 0.5 });
  assert.deepEqual(readPoint([0.5, 0.5]), { x: 0.5, y: 0.5 });
});
test('les coordonnées PointF restent compatibles', () => {
  assert.deepEqual(readPoint({ value: { x: 0, y: -1 } }), { x: 0, y: -1 });
  assert.deepEqual(readPoint({ x: 1, y: 2 }), { x: 1, y: 2 });
});
test('les coordonnées ambiguës ou non finies sont refusées', () => {
  for (const value of [null, {}, { value: [1] }, [1, 2, 3], [NaN, 0], { x: '0.5', y: 0 }, { x: Infinity, y: 0 }]) {
    assert.throws(() => readPoint(value), TypeError);
  }
});
