import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { calculateRelativeScale } = require('../plugin/zoom.cjs');

test('le zoom relatif multiplie le cadrage existant', () => {
  assert.equal(calculateRelativeScale(180, 10), 198);
  assert.ok(Math.abs(calculateRelativeScale(112.98699188232422, 10) - 124.28569107055665) < 1e-10);
});

test('le zoom relatif refuse une échelle ou une intensité invalide', () => {
  assert.throws(() => calculateRelativeScale(0, 10), /échelle de départ/);
  assert.throws(() => calculateRelativeScale(100, 0), /intensité/);
  assert.throws(() => calculateRelativeScale(100, 201), /intensité/);
});
