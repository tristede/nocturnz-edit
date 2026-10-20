/* Every zoom edit targets a newly cloned sequence. There is no in-place fallback. */
function withHost(host) {
  const id = (value) => value.guid.toString().replace(/[{}]/g, '').toLowerCase();
  async function signature(item) {
    const media = host.ClipProjectItem.cast(await item.getProjectItem());
    if (!media || await media.isSequence() || await media.isMulticamClip() || await media.isMergedClip()) {
      throw new Error('Clip composé non pris en charge pour cette copie.');
    }
    const [track, name, start, end, sourceIn, sourceOut] = await Promise.all([
      item.getTrackIndex(), item.getName(), item.getStartTime(), item.getEndTime(),
      item.getInPoint(), item.getOutPoint(),
    ]);
    return { track, key: JSON.stringify([track, name, media.getId(), String(start.ticks),
      String(end.ticks), String(sourceIn.ticks), String(sourceOut.ticks)]) };
  }
  async function assertActive(project, sequence) {
    const activeProject = await host.Project.getActiveProject();
    const activeSequence = activeProject && await activeProject.getActiveSequence();
    if (!activeProject || id(activeProject) !== id(project) || !activeSequence || id(activeSequence) !== id(sequence)) {
      throw new Error('La séquence active a changé. Aucune application de zoom.');
    }
  }
  async function create(project, source, items) {
    if (!items.length) throw new Error('Aucun clip à traiter.');
    await assertActive(project, source);
    const before = await project.getSequences();
    const known = new Set(before.map(id));
    if (!known.has(id(source))) throw new Error('Séquence source introuvable.');
    const signatures = await Promise.all(items.map(signature));
    if (new Set(signatures.map((entry) => entry.key)).size !== items.length) {
      throw new Error('Sélection ambiguë. Aucune copie appliquée.');
    }
    await assertActive(project, source);
    let committed = false;
    project.lockedAccess(() => {
      const action = source.createCloneAction();
      committed = project.executeTransaction((compound) => {
        if (!compound.addAction(action)) throw new Error('Duplication refusée par Premiere.');
      }, 'Nocturnz/Edit — Dupliquer la séquence');
    });
    if (!committed) throw new Error('Duplication non confirmée. Original non modifié.');
    const copies = (await project.getSequences()).filter((sequence) => !known.has(id(sequence)));
    if (copies.length !== 1 || id(copies[0]) === id(source)) {
      throw new Error('Copie non identifiée avec certitude. Aucun zoom appliqué.');
    }
    const copy = copies[0], matches = new Map();
    for (const trackIndex of new Set(signatures.map((entry) => entry.track))) {
      const track = await copy.getVideoTrack(trackIndex);
      for (const item of await track.getTrackItems(1, false)) {
        let entry;
        try { entry = await signature(item); } catch (_) { continue; }
        if (!matches.has(entry.key)) matches.set(entry.key, []);
        matches.get(entry.key).push(item);
      }
    }
    const targets = signatures.map(({ key }) => {
      const found = matches.get(key);
      if (!found || found.length !== 1) throw new Error('Clip absent ou ambigu dans la copie. Aucun zoom appliqué.');
      return found[0];
    });
    let suffix = 1, name;
    do { name = `${source.name} — Nocturnz Zooms ${suffix++}`; }
    while (before.some((sequence) => sequence.name === name));
    const projectItem = await copy.getProjectItem();
    const originalItem = await source.getProjectItem();
    if (projectItem.getId() === originalItem.getId()) {
      throw new Error('Élément de copie non distinct de l’original. Aucun zoom appliqué.');
    }
    if (!await project.openSequence(copy) || !await project.setActiveSequence(copy)) {
      throw new Error('Ouverture de la copie impossible. Aucun zoom appliqué.');
    }
    await assertActive(project, copy);
    let selected = false;
    host.TrackItemSelection.createEmptySelection((selection) => {
      for (const item of targets) selection.addItem(item, true);
      selected = copy.setSelection(selection);
    });
    if (selected === false) throw new Error('Sélection de la copie refusée. Aucun zoom appliqué.');
    return { sequence: copy, items: targets, name, projectItem, originalId: id(source) };
  }
  async function assertCopy(project, draft) {
    if (!draft || id(draft.sequence) === draft.originalId) throw new Error('Application sur l’original refusée.');
    await assertActive(project, draft.sequence);
  }
  return { create, assertCopy };
}

module.exports = { withHost };
