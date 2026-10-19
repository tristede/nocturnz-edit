/* Saved timeline occurrence labels -> native Motion framing, no voice analysis. */
(() => {
  const el = (id) => document.getElementById(id);
  const zoom = window.NocturnzZoom;
  let host = null, uxp = null, snapshot = null, context = null, busy = false;
  let mappings = new Map(), savedCoordinates = new Map(), saveQueue = Promise.resolve();
  try { host = require('premierepro'); uxp = require('uxp'); } catch (_) {}
  const guid = (value) => String(value).replace(/[{}]/g, '').toLowerCase();
  const pathKey = (value) => String(value || '').replace(/\\/g, '/').normalize('NFC');
  const say = (message, error = false) => {
    el('speaker-label-status').textContent = message;
    el('speaker-label-status').className = `tool-status${error ? ' error' : ''}`;
  };
  function bind(button, action) {
    const run = async () => {
      if (busy || !zoom.acquire()) return;
      busy = true; setDisabled(true);
      try { await action(); } catch (error) { say(error.message || String(error), true); }
      finally { busy = false; zoom.release(); setDisabled(false); }
    };
    button.addEventListener('click', run);
    button.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); run(); }
    });
  }
  function setDisabled(disabled) {
    document.querySelectorAll('#speaker-labels-pane [role=button]').forEach((button) => {
      button.setAttribute('aria-disabled', String(disabled));
    });
    document.querySelectorAll('#speaker-labels-pane input,#speaker-labels-pane select').forEach((input) => {
      input.disabled = disabled;
    });
  }
  async function nativeContext() {
    if (!host) throw new Error('Ouvre le panneau dans Premiere Pro.');
    const project = await host.Project.getActiveProject();
    const sequence = project && await project.getActiveSequence();
    if (!sequence) throw new Error('Aucune séquence active.');
    if (!project.path) throw new Error('Enregistre le projet dans Premiere, puis relis les libellés.');
    const frameSize = await sequence.getFrameSize();
    return { project, sequence, path: project.path, sequenceId: guid(sequence.guid.toString()),
      projectId: guid(project.guid.toString()), timebase: String(await sequence.getTimebase()), frameSize };
  }
  function checkContext(current, saved) {
    if (guid(current.sequenceId) !== saved.sequenceId || pathKey(current.path) !== pathKey(saved.projectPath) ||
        current.timebase !== saved.timebase || current.frameSize.width !== saved.frameSize.width ||
        current.frameSize.height !== saved.frameSize.height) {
      throw new Error('Le projet, la séquence ou ses réglages ont changé. Relis les libellés.');
    }
  }
  async function readFileLabels(current) {
    let response;
    try {
      response = await fetch('http://127.0.0.1:8765/api/v1/zooms/labels/read', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Nocturnz-Client': 'premiere-panel' },
        body: JSON.stringify({ path: current.path, sequenceId: current.sequenceId }),
      });
    } catch (_) { throw new Error('Service local inaccessible. Lance npm run service.'); }
    if (response.status === 404) throw new Error('Redémarre le service local pour charger le module Libellés.');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Service : HTTP ${response.status}`);
    return data;
  }
  async function freshContext() {
    if (!snapshot) throw new Error('Lis les libellés du projet enregistré.');
    const current = await nativeContext(); checkContext(current, snapshot);
    const reread = await readFileLabels(current);
    if (reread.projectSha256 !== snapshot.projectSha256) {
      throw new Error('Le fichier projet a changé. Relis les libellés avant de continuer.');
    }
    return current;
  }
  const unwrap = (raw) => raw && typeof raw === 'object' && 'value' in raw ? raw.value : raw;
  async function numberValue(param) {
    if (!param || await param.isTimeVarying()) throw new Error('Trajectoire animée ou paramètre manquant.');
    const value = Number(unwrap((await param.getStartValue()).value));
    if (!Number.isFinite(value)) throw new Error('Valeur de trajectoire illisible.');
    return value;
  }
  async function pointValue(param) {
    if (!param || await param.isTimeVarying()) throw new Error('Position ou point d’ancrage déjà animé.');
    const value = unwrap((await param.getStartValue()).value);
    if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y)) throw new Error('Cadrage illisible.');
    return { x: value.x, y: value.y };
  }
  async function motionParameters(item) {
    const chain = await item.getComponentChain();
    for (let i = 0; i < chain.getComponentCount(); i += 1) {
      const component = chain.getComponentAtIndex(i);
      if (!/motion/i.test(await component.getMatchName())) continue;
      const params = {};
      for (let j = 0; j < component.getParamCount(); j += 1) {
        const param = component.getParam(j), name = param.displayName || '';
        if (/^(uniform )?scale$|^échelle( uniforme)?$|^echelle( uniforme)?$/i.test(name)) params.scale = param;
        if (/^position$/i.test(name)) params.position = param;
        if (/^(anchor point|point d[’']ancrage)$/i.test(name)) params.anchor = param;
        if (/^rotation$/i.test(name)) params.rotation = param;
      }
      return params;
    }
    return null;
  }
  async function selectedVideo(sequence) {
    const selection = await sequence.getSelection();
    const items = selection ? await selection.getTrackItems() : [];
    const result = [];
    for (const item of items) {
      const params = await motionParameters(item);
      if (params && params.scale && params.position) result.push({ item, params });
    }
    return result;
  }
  async function describe(item) {
    const clip = host.ClipProjectItem.cast(await item.getProjectItem());
    if (!clip || await clip.isSequence() || await clip.isMulticamClip() || await clip.isMergedClip() || await clip.isOffline()) {
      throw new Error('Clip composé, multicam ou média hors ligne non pris en charge.');
    }
    if (await item.isDisabled() || await item.isAdjustmentLayer() || await item.isSpeedReversed()) {
      throw new Error('Clip désactivé, inversé ou calque d’effets non pris en charge.');
    }
    const [name, trackIndex, start, end, sourceIn, sourceOut, mediaPath] = await Promise.all([
      item.getName(), item.getTrackIndex(), item.getStartTime(), item.getEndTime(),
      item.getInPoint(), item.getOutPoint(), clip.getMediaFilePath(),
    ]);
    if (BigInt(end.ticks) - BigInt(start.ticks) !== BigInt(sourceOut.ticks) - BigInt(sourceIn.ticks)) {
      throw new Error('Les clips retimés ne sont pas pris en charge.');
    }
    return { name, trackIndex, startTicks: String(start.ticks), endTicks: String(end.ticks),
      sourceInTicks: String(sourceIn.ticks), sourceOutTicks: String(sourceOut.ticks), mediaPath };
  }
  function coordinate(clip) {
    return JSON.stringify([clip.trackIndex, clip.startTicks, clip.endTicks, clip.sourceInTicks,
      clip.sourceOutTicks, pathKey(clip.mediaPath), clip.name]);
  }
  function savedClip(info) {
    const match = savedCoordinates.get(coordinate(info));
    if (!match) throw new Error('Clip absent ou ambigu dans la sauvegarde. Enregistre puis relis les libellés.');
    if (!match.supported) throw new Error(match.unsupportedReason || 'Clip non pris en charge.');
    if (!match.labelKey) throw new Error('Aucun libellé propre à cette occurrence dans le projet enregistré.');
    return match;
  }
  function validFrame(frame) {
    return frame && typeof frame.mediaPath === 'string' && frame.scale > 0 && frame.scale <= 10000 &&
      frame.frameSize && Number.isFinite(frame.frameSize.width) && frame.frameSize.width > 0 &&
      Number.isFinite(frame.frameSize.height) && frame.frameSize.height > 0 &&
      [frame.scale, frame.rotation, frame.position?.x, frame.position?.y, frame.anchor?.x, frame.anchor?.y]
        .every((value) => Number.isFinite(value) && Math.abs(value) <= 1000000);
  }
  function storageName() {
    const key = `${context.projectId}-${context.sequenceId}`;
    if (!/^[0-9a-f-]{73}$/.test(key)) throw new Error('Identifiant de cadrage invalide.');
    return `zoom-cadrages-${key}.json`;
  }
  async function loadMappings() {
    mappings = new Map();
    if (!uxp) return;
    const folder = await uxp.storage.localFileSystem.getDataFolder();
    let file;
    try { file = await folder.getEntry(storageName()); } catch (_) { return; }
    const text = await file.read();
    if (text.length > 1024 * 1024) throw new Error('Fichier de cadrages trop volumineux.');
    const data = JSON.parse(text);
    if (data.schemaVersion !== 1 || !Array.isArray(data.mappings)) return;
    for (const row of data.mappings) {
      if (typeof row.key !== 'string' || !Array.isArray(row.frames)) continue;
      const frames = new Map();
      for (const frame of row.frames) if (validFrame(frame)) frames.set(pathKey(frame.mediaPath), frame);
      mappings.set(row.key, { name: String(row.name || '').slice(0, 80), frames });
    }
  }
  function saveMappings() {
    const filename = storageName();
    const text = JSON.stringify({ schemaVersion: 1, mappings: [...mappings].map(([key, row]) =>
      ({ key, name: row.name, frames: [...row.frames.values()] })) });
    saveQueue = saveQueue.catch(() => {}).then(async () => {
      const folder = await uxp.storage.localFileSystem.getDataFolder();
      const file = await folder.createFile(filename, { overwrite: true }); await file.write(text);
    });
    return saveQueue;
  }
  function render() {
    el('speaker-label-rows').replaceChildren();
    el('speaker-apply-controls').hidden = !snapshot || !snapshot.labels.length;
    if (!snapshot) return;
    for (const label of snapshot.labels) {
      if (!mappings.has(label.key)) mappings.set(label.key, { name: '', frames: new Map() });
      const mapping = mappings.get(label.key);
      const row = document.createElement('section'); row.className = 'speaker-label-row';
      const heading = document.createElement('div'); heading.className = 'speaker-label-heading';
      const title = document.createElement('span'); title.className = 'speaker-label-name';
      const swatch = document.createElement('span'); swatch.className = 'speaker-label-swatch';
      if (Number.isInteger(label.packedColor)) {
        swatch.style.backgroundColor = `#${(label.packedColor & 0xffffff).toString(16).padStart(6, '0')}`;
      }
      const name = label.index === null ? label.storedName || 'Sans nom' : `Libellé ${label.index + 1}`;
      const text = document.createElement('span'); text.textContent = name;
      title.appendChild(swatch); title.appendChild(text); heading.appendChild(title);
      const count = document.createElement('span'); count.className = 'speaker-label-count';
      count.textContent = `${label.clipCount} clip(s)`; heading.appendChild(count); row.appendChild(heading);
      const input = document.createElement('input'); input.type = 'text'; input.maxLength = 80;
      input.placeholder = 'Interlocuteur'; input.value = mapping.name;
      input.setAttribute('aria-label', `Interlocuteur pour ${name}`);
      input.addEventListener('change', () => {
        mapping.name = input.value.slice(0, 80);
        saveMappings().catch(() => say('Nom non sauvegardé dans les réglages locaux.', true));
      });
      row.appendChild(input);
      const capture = document.createElement('div'); capture.className = 'button button-secondary';
      capture.setAttribute('role', 'button'); capture.setAttribute('tabindex', '0');
      capture.textContent = 'Capturer le cadrage sélectionné'; bind(capture, () => captureFrame(label.key)); row.appendChild(capture);
      if (mapping.frames.size) {
        const detail = document.createElement('p'); detail.className = 'speaker-frame-value';
        detail.textContent = [...mapping.frames.values()].map((frame) =>
          `${pathKey(frame.mediaPath).split('/').pop()} · ${Number(frame.scale.toFixed(2))} %`).join(' / ');
        row.appendChild(detail);
      }
      el('speaker-label-rows').appendChild(row);
    }
    setDisabled(busy);
  }
  async function captureFrame(labelKey) {
    const current = await freshContext();
    const selected = await selectedVideo(current.sequence);
    if (selected.length !== 1) throw new Error('Sélectionne un seul clip vidéo cadré dans Premiere.');
    const { item, params } = selected[0], info = await describe(item);
    if (savedClip(info).labelKey !== labelKey) throw new Error('Le clip sélectionné ne porte pas ce libellé dans le projet enregistré.');
    const frame = { mediaPath: info.mediaPath, scale: await numberValue(params.scale),
      position: await pointValue(params.position), anchor: await pointValue(params.anchor),
      rotation: await numberValue(params.rotation),
      frameSize: { width: current.frameSize.width, height: current.frameSize.height } };
    if (!validFrame(frame)) throw new Error('Cadrage non pris en charge.');
    const mapping = mappings.get(labelKey);
    mapping.frames.set(pathKey(info.mediaPath), frame);
    await saveMappings(); render(); say('Cadrage capturé et conservé pour cette source.');
  }
  async function applyFrames() {
    const current = await freshContext();
    const selected = await selectedVideo(current.sequence);
    if (!selected.length) throw new Error('Sélectionne les clips vidéo à cadrer.');
    const preset = zoom.presets.find((item) => item.id === el('speaker-preset').value);
    if (!preset) throw new Error('Preset inconnu.');
    const amount = Number(el('speaker-amount').value), duration = Number(el('speaker-duration').value);
    const easing = el('speaker-easing').value, changes = [], skipped = [];
    for (const { item, params } of selected) {
      const name = await item.getName();
      try {
        const info = await describe(item), saved = savedClip(info);
        const frame = mappings.get(saved.labelKey)?.frames.get(pathKey(info.mediaPath));
        if (!validFrame(frame)) throw new Error('cadrage à capturer pour cette couleur et cette source');
        if (frame.frameSize.width !== current.frameSize.width || frame.frameSize.height !== current.frameSize.height) {
          throw new Error('dimensions modifiées, cadrage à recapturer');
        }
        // Reject existing animation rather than overwrite manual work.
        await numberValue(params.scale); await pointValue(params.position); await pointValue(params.anchor);
        await numberValue(params.rotation);
        const keys = preset.motion ? zoom.buildKeys(frame.scale, amount, BigInt(info.sourceInTicks),
          BigInt(info.sourceOutTicks), BigInt(current.timebase), duration, preset.motion, easing) : null;
        if (keys && !await params.scale.areKeyframesSupported()) throw new Error('animation indisponible');
        changes.push({ params, frame, keys });
      } catch (error) { skipped.push(`${name} : ${error.message}`); }
    }
    if (!changes.length) throw new Error(`Aucun cadrage applicable. ${skipped.join(' · ')}`);
    // Re-check active context after the async parameter reads.
    checkContext(await nativeContext(), snapshot);
    let committed = false;
    current.project.lockedAccess(() => {
      const actions = [];
      for (const { params, frame, keys } of changes) {
        for (const key of ['position', 'anchor']) {
          const point = new host.PointF(frame[key].x, frame[key].y);
          actions.push(params[key].createSetValueAction(params[key].createKeyframe(point), true));
        }
        actions.push(params.rotation.createSetValueAction(params.rotation.createKeyframe(frame.rotation), true));
        if (keys) {
          actions.push(params.scale.createSetTimeVaryingAction(true));
          for (const point of keys) {
            const keyframe = params.scale.createKeyframe(point.value);
            keyframe.position = host.TickTime.createWithTicks(point.ticks);
            actions.push(params.scale.createAddKeyframeAction(keyframe));
            actions.push(params.scale.createSetInterpolationAtKeyframeAction(
              keyframe.position, host.Constants.InterpolationMode.LINEAR, true,
            ));
          }
        } else actions.push(params.scale.createSetValueAction(params.scale.createKeyframe(frame.scale), true));
      }
      committed = current.project.executeTransaction((compound) => {
        for (const action of actions) if (!compound.addAction(action)) throw new Error('Premiere a refusé une action.');
      }, 'Nocturnz/Edit — Cadrages par libellé');
    });
    if (!committed) throw new Error('Premiere n’a pas confirmé la transaction.');
    say(`${changes.length} cadrage(s) envoyé(s). Résultat à vérifier dans Premiere.${skipped.length ? ` ${skipped.length} ignoré(s) : ${skipped.join(' · ')}` : ''}`);
  }
  for (const item of zoom.presets) {
    const option = document.createElement('option'); option.value = item.id; option.textContent = item.title;
    el('speaker-preset').appendChild(option);
  }
  el('speaker-preset').addEventListener('change', () => {
    const item = zoom.presets.find((value) => value.id === el('speaker-preset').value);
    el('speaker-motion-fields').hidden = !item.motion;
    el('speaker-amount-field').hidden = !item.motion;
    el('speaker-amount').value = String(item.amount); el('speaker-amount-value').textContent = `${item.amount} %`;
    el('speaker-duration').value = String(item.duration);
  });
  el('speaker-amount').addEventListener('input', () => {
    el('speaker-amount-value').textContent = `${el('speaker-amount').value} %`;
  });
  bind(el('speaker-read-labels'), async () => {
    snapshot = null; context = null; mappings = new Map(); savedCoordinates = new Map(); render();
    el('speaker-label-source').textContent = 'Projet enregistré';
    say('Lecture du projet enregistré…');
    const current = await nativeContext(), data = await readFileLabels(current);
    checkContext(await nativeContext(), data);
    snapshot = data; context = current;
    for (const clip of data.clips) {
      const key = coordinate(clip);
      savedCoordinates.set(key, savedCoordinates.has(key) ? null : clip);
    }
    await saveQueue.catch(() => {});
    await loadMappings(); render();
    el('speaker-label-source').textContent = `${data.sequenceName} · projet enregistré`;
    say(data.labels.length ? `${data.labels.length} libellé(s) lus. Enregistre les changements de couleurs puis relis-les avant application.` : 'Aucun libellé de clip reconnu dans cette séquence enregistrée.');
  });
  bind(el('speaker-apply'), applyFrames);
})();
