import test from 'node:test';
import assert from 'node:assert/strict';
import { frameIndexToTicks, frameRate, ticksToFrameIndex, composeScale, secondsToTicks, ticksToSeconds } from '../core/time.mjs';
import { createEditPlan, validateEditPlan } from '../core/edit-plan.mjs';

test('les images à cadence fractionnaire gardent une correspondance stable', () => {
  const rate = frameRate(30000, 1001);
  for (const frame of [0, 1, 29, 300, 10000]) {
    assert.equal(ticksToFrameIndex(frameIndexToTicks(frame, rate), rate), frame);
  }
});

test('les grands temps Premiere restent des ticks exacts en chaîne', () => {
  const ticks = secondsToTicks(36000.125);
  assert.equal(typeof ticks, 'string');
  assert.equal(ticks, '9144607752000000');
  assert.equal(ticksToSeconds(ticks), 36000.125);
});

test('un zoom relatif respecte le cadrage existant', () => {
  assert.equal(composeScale(180, 110), 198);
});

test('un plan distingue les propositions des opérations appliquées', () => {
  const plan = createEditPlan({
    projectId: 'project-1', sequenceId: 'sequence-1', timebase: frameRate(25),
    operations: [{ id: 'zoom-a', status: 'proposed', kind: 'scale' }],
  });
  assert.deepEqual(validateEditPlan(plan), []);
  assert.equal(plan.operations[0].status, 'proposed');
});

test('un état d’opération inconnu est refusé', () => {
  const plan = createEditPlan({
    projectId: 'project-1', sequenceId: 'sequence-1', timebase: frameRate(25),
    operations: [{ id: 'bad', status: 'succeeded' }],
  });
  assert.match(validateEditPlan(plan)[0], /État invalide/);
});
