import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('contrat santé annonce uniquement les capacités du moteur installé', () => {
  const result = spawnSync('python3', ['-c', 'import json; from service.server import health_payload; print(json.dumps(health_payload()))'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.status, 'ready');
  assert.equal(payload.engines[0].name, 'auto-editor');
  assert.equal(payload.mediaProcessing, payload.engines[0].available);
  assert.deepEqual(payload.capabilities, payload.mediaProcessing
    ? ['silence-analysis', 'silence-review', 'premiere-xml-export'] : []);
});
