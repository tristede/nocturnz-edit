import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('contrat santé du service local sans prétendre traiter des médias', () => {
  const result = spawnSync('python3', ['-c', 'import json; from service.server import health_payload; print(json.dumps(health_payload()))'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.status, 'ready');
  assert.equal(payload.mediaProcessing, false);
  assert.deepEqual(payload.capabilities, []);
});
