/* Manual native validation only; never loaded by the panel. */
const ppro = require('premierepro');
const { readPoint } = require('./point.cjs');

async function context(sequenceOverride) {
  const project = await ppro.Project.getActiveProject();
  if (!project || !project.path.endsWith('/validation-local/Nocturnz_Zooms_validation.prproj')) throw new Error('Validation réservée au projet de test isolé.');
  const fixtureRoot = project.path.slice(0, -'/validation-local/Nocturnz_Zooms_validation.prproj'.length);
  const sequence = sequenceOverride || await project.getActiveSequence();
  if (!sequence || !/^Nocturnz — Validation Zooms(?:$| )/.test(sequence.name)) throw new Error('Séquence de test inactive.');
  const track = await sequence.getVideoTrack(0);
  const items = await track.getTrackItems(1, false);
  if (items.length !== 3) throw new Error('La validation attend exactement trois clips.');
  for (const item of items) {
    const clip = ppro.ClipProjectItem.cast(await item.getProjectItem());
    if (!clip || (await clip.getMediaFilePath()).replace(/^\/{3,}/, '/') !== fixtureRoot + '/.runtime/validation/zoom-labels/nocturnz-grid.png') {
      throw new Error('La séquence contient un média autre que la mire de test.');
    }
  }
  return { project, sequence, items };
}

async function parameters(item) {
  const chain = await item.getComponentChain();
  for (let i = 0; i < chain.getComponentCount(); i += 1) {
    const component = chain.getComponentAtIndex(i);
    if (!/motion/i.test(await component.getMatchName())) continue;
    const result = {};
    for (let j = 0; j < component.getParamCount(); j += 1) {
      const param = component.getParam(j), name = param.displayName || '';
      if (/^(uniform )?scale$|^échelle( uniforme)?$|^echelle( uniforme)?$/i.test(name)) result.scale = param;
      if (/^position$/i.test(name)) result.position = param;
      if (/^(anchor point|point d[’']ancrage)$/i.test(name)) result.anchor = param;
      if (/^rotation$/i.test(name)) result.rotation = param;
    }
    return result;
  }
  throw new Error('Trajectoire absente de la mire.');
}

const unwrap = (value) => value && typeof value === 'object' && 'value' in value ? value.value : value;
async function inspect(sequenceOverride) {
  const { items } = await context(sequenceOverride), report = [];
  for (const item of items) {
    const params = await parameters(item), row = {};
    for (const [name, param] of Object.entries(params)) {
      const value = unwrap((await param.getStartValue()).value);
      row[name] = name === 'position' || name === 'anchor' ? readPoint(value) : value;
    }
    row.animated = await params.scale.isTimeVarying();
    row.keys = [];
    if (row.animated) {
      for (const time of await params.scale.getKeyframeListAsTickTimes()) {
        row.keys.push({ ticks: String(time.ticks), value: unwrap((await params.scale.getValueAtTime(time)).value) });
      }
    }
    report.push(row);
  }
  return report;
}

async function select(indices) {
  const { sequence, items } = await context();
  if (!indices.length || indices.some((i) => !Number.isInteger(i) || i < 0 || i > 2)) throw new Error('Indices invalides.');
  ppro.TrackItemSelection.createEmptySelection((selection) => {
    for (const index of indices) selection.addItem(items[index], true);
    sequence.setSelection(selection);
  });
  return (await (await sequence.getSelection()).getTrackItems()).length;
}

async function frame(index, scale, x, y) {
  const { project, items } = await context();
  if (!Number.isInteger(index) || index < 0 || index > 2 ||
      ![scale, x, y].every(Number.isFinite) || scale < 1 || scale > 300) throw new Error('Cadrage invalide.');
  const params = await parameters(items[index]);
  if (await params.scale.isTimeVarying() || await params.position.isTimeVarying()) throw new Error('Mire déjà animée.');
  let success;
  project.lockedAccess(() => {
    const scaleAction = params.scale.createSetValueAction(params.scale.createKeyframe(scale), true);
    const positionAction = params.position.createSetValueAction(params.position.createKeyframe(new ppro.PointF(x, y)), true);
    success = project.executeTransaction((compound) => {
      if (!compound.addAction(scaleAction) || !compound.addAction(positionAction)) throw new Error('Action de préparation refusée.');
    }, 'Nocturnz — Préparation mire');
  });
  if (!success) throw new Error('Préparation non confirmée.');
  return inspect();
}

async function inspectAll() {
  const { project } = await context(), result = [];
  for (const sequence of await project.getSequences()) {
    if (/^Nocturnz — Validation Zooms(?:$| )/.test(sequence.name)) {
      result.push({ name: sequence.name, guid: sequence.guid.toString(), frames: await inspect(sequence) });
    }
  }
  return result;
}

module.exports = { inspect, inspectAll, select, frame };
