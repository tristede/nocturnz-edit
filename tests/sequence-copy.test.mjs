import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { withHost } = require('../plugin/sequence-copy.cjs');

function fixture({ cloneCount = 1, sameProjectItem = false, mismatch = false, duplicate = false, refused = false } = {}) {
  const item = (start, name = 'mire') => ({
    getProjectItem: async () => ({ getId: () => 'media-1', isSequence: async () => false,
      isMulticamClip: async () => false, isMergedClip: async () => false }),
    getTrackIndex: async () => 0, getName: async () => name,
    getStartTime: async () => ({ ticks: String(start) }), getEndTime: async () => ({ ticks: String(start + 100) }),
    getInPoint: async () => ({ ticks: String(start) }), getOutPoint: async () => ({ ticks: String(start + 100) }),
  });
  const sourceItem = item(0), targetItem = item(0, mismatch ? 'changed' : 'mire');
  const original = { guid: 'source', name: 'Montage', createCloneAction: () => ({ type: 'clone' }),
    getProjectItem: async () => ({ getId: () => 'original-project-item' }) };
  const copy = { guid: 'copy', name: 'Montage copie',
    getProjectItem: async () => ({ getId: () => sameProjectItem ? 'original-project-item' : 'copy-project-item' }),
    getVideoTrack: async () => ({ getTrackItems: async () => duplicate ? [targetItem, item(0)] : [targetItem] }),
    setSelection: () => true };
  let sequences = [original], active = original;
  const project = { guid: 'project', getActiveSequence: async () => active, getSequences: async () => sequences,
    lockedAccess: (callback) => callback(),
    executeTransaction: (callback) => {
      callback({ addAction: (action) => { assert.equal(action.type, 'clone'); return !refused; } });
      sequences = [original, ...Array.from({ length: cloneCount }, (_, index) => ({ ...copy, guid: `copy-${index}` }))];
      return true;
    },
    openSequence: async () => true, setActiveSequence: async (sequence) => { active = sequence; return true; },
  };
  const host = { Project: { getActiveProject: async () => project }, ClipProjectItem: { cast: (value) => value },
    TrackItemSelection: { createEmptySelection: (callback) => callback({ addItem: () => true }) } };
  return { copier: withHost(host), project, original, sourceItem, targetItem, switchTo: (sequence) => { active = sequence; } };
}

test('la préparation renvoie uniquement les clips de la nouvelle séquence', async () => {
  const f = fixture();
  const draft = await f.copier.create(f.project, f.original, [f.sourceItem]);
  assert.equal(draft.items[0], f.targetItem);
  assert.notEqual(draft.items[0], f.sourceItem);
  assert.notEqual(draft.sequence.guid, f.original.guid);
  assert.equal(draft.name, 'Montage — Nocturnz Zooms 1');
  await f.copier.assertCopy(f.project, draft);
  assert.equal(f.original.name, 'Montage');
});

test('aucun repli sur la source si la duplication échoue ou reste ambiguë', async () => {
  for (const options of [{ cloneCount: 0 }, { cloneCount: 2 }, { refused: true }, { sameProjectItem: true }]) {
    const f = fixture(options);
    await assert.rejects(f.copier.create(f.project, f.original, [f.sourceItem]));
    assert.equal(f.original.name, 'Montage');
  }
});

test('un clip manquant ou ambigu dans la copie bloque toute application', async () => {
  for (const options of [{ mismatch: true }, { duplicate: true }]) {
    const f = fixture(options);
    await assert.rejects(f.copier.create(f.project, f.original, [f.sourceItem]), /absent ou ambigu/);
  }
});

test('la sélection doit être non vide et non ambiguë avant duplication', async () => {
  const f = fixture();
  await assert.rejects(f.copier.create(f.project, f.original, []), /Aucun clip/);
  await assert.rejects(f.copier.create(f.project, f.original, [f.sourceItem, f.sourceItem]), /ambiguë/);
});

test('un retour à la séquence source bloque la transaction finale', async () => {
  const f = fixture();
  const draft = await f.copier.create(f.project, f.original, [f.sourceItem]);
  f.switchTo(f.original);
  await assert.rejects(f.copier.assertCopy(f.project, draft), /active a changé/);
  await assert.rejects(f.copier.assertCopy(f.project, { ...draft, sequence: f.original }), /original refusée/);
});
