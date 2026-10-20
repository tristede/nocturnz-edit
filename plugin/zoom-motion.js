/* Original Nocturnz zoom presets and UXP adapter. Imported vendor code is not executed. */
(() => {
  const el = (id) => document.getElementById(id);
  const ticksPerSecond = 254016000000n;
  const presets = [
    { id: 'fixed', title: 'Fixe', icon: 'zooms', motion: null, amount: 10, duration: 0 },
    { id: 'slow-in', title: 'Lent in', icon: 'zoom-in', motion: 'in', amount: 5, duration: 0 },
    { id: 'slow-out', title: 'Lent out', icon: 'zoom-out', motion: 'out', amount: 5, duration: 0 },
    { id: 'punch-in', title: 'Punch in', icon: 'zoom-in', motion: 'in', amount: 15, duration: 300 },
    { id: 'punch-out', title: 'Punch out', icon: 'zoom-out', motion: 'out', amount: 15, duration: 300 },
    { id: 'return', title: 'Aller-retour', icon: 'zoom-return', motion: 'return', amount: 10, duration: 0 },
  ];
  let host = null;
  try { host = require('premierepro'); } catch (_) {}
  let mode = 'speaker', preset = presets[0], busy = false;

  function bind(element, action) {
    element.addEventListener('click', action);
    element.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); action(); }
    });
  }
  function say(message, state = '') {
    el('zoom-status').textContent = message;
    el('zoom-status').className = `tool-status ${state}`;
  }
  function refresh() {
    document.querySelectorAll('[data-zoom-mode]').forEach((button) => {
      const active = button.dataset.zoomMode === mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    el('zoom-presets-pane').hidden = mode !== 'presets';
    el('zoom-cuts-pane').hidden = mode !== 'cuts';
    el('zoom-speaker-pane').hidden = mode !== 'speaker';
    el('zoom-shared-settings').hidden = mode === 'speaker';
    el('zoom-motion-fields').hidden = mode !== 'cuts' && !preset.motion;
    el('apply-zoom').textContent = 'Créer la version zoomée';
    if (mode !== 'speaker') say('Création sur copie · à valider dans Premiere');
  }
  function usesMotion() { return mode === 'cuts' || (mode === 'presets' && Boolean(preset.motion)); }
  for (const item of presets) {
    const card = document.createElement('div');
    card.className = `zoom-preset is-pending${item === preset ? ' is-active' : ''}`;
    card.setAttribute('role', 'button'); card.setAttribute('tabindex', '0');
    card.setAttribute('aria-pressed', String(item === preset));
    card.dataset.zoomPreset = item.id;
    const icon = document.createElement('img');
    icon.src = `icons/${item.icon}.svg`; icon.alt = ''; icon.width = 26; icon.height = 26;
    const title = document.createElement('span'); title.textContent = item.title;
    card.appendChild(icon); card.appendChild(title); el('zoom-presets').appendChild(card);
    bind(card, () => {
      if (busy || el('apply-zoom').getAttribute('aria-disabled') === 'true') return;
      preset = item;
      document.querySelectorAll('[data-zoom-preset]').forEach((button) => {
        const active = button.dataset.zoomPreset === item.id;
        button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', String(active));
      });
      // The shared setter is declared by index.js after this script has loaded.
      setZoomInput(item.amount);
      el('zoom-duration').value = String(item.duration);
      say(''); refresh();
    });
  }
  document.querySelectorAll('[data-zoom-mode]').forEach((button) => bind(button, () => {
    if (busy || el('apply-zoom').getAttribute('aria-disabled') === 'true') return;
    mode = button.dataset.zoomMode; say(''); refresh();
  }));
  document.querySelectorAll('[data-speaker-source]').forEach((button) => bind(button, () => {
    if (busy || el('apply-zoom').getAttribute('aria-disabled') === 'true') return;
    el('speaker-labels-pane').hidden = button.dataset.speakerSource !== 'labels';
    el('speaker-voice-pending').hidden = button.dataset.speakerSource !== 'voice';
    el('speaker-label-status').hidden = button.dataset.speakerSource !== 'labels';
    document.querySelectorAll('[data-speaker-source]').forEach((other) => {
      const active = other === button;
      other.classList.toggle('is-active', active); other.setAttribute('aria-pressed', String(active));
    });
  }));

  // Param animation uses source time. Retimed/reversed/compound clips are refused below.
  function buildKeys(base, amount, inTicks, outTicks, frameTicks, durationMs, motion, easing) {
    if (!Number.isFinite(base) || base <= 0 || !Number.isFinite(amount) || amount < 1 || amount > 200) {
      throw new Error('Échelle ou intensité invalide.');
    }
    if (frameTicks <= 0n || inTicks < 0n || outTicks <= inTicks) throw new Error('Temps source invalide.');
    const frames = (outTicks - inTicks) / frameTicks;
    if (frames < (motion === 'return' ? 3n : 2n)) throw new Error('Clip trop court pour ce mouvement.');
    const lastFrame = frames - 1n;
    const requested = durationMs === 0 ? lastFrame : (BigInt(durationMs) * ticksPerSecond / 1000n) / frameTicks;
    let movingFrames = requested < lastFrame ? requested : lastFrame;
    if (movingFrames < 1n) movingFrames = 1n;
    if (motion === 'return' && movingFrames < 2n) movingFrames = 2n;
    const elevated = base * (1 + amount / 100);
    const keys = new Map();
    const add = (frame, value) => keys.set(String(frame), { ticks: String(inTicks + frame * frameTicks), value });
    const ramp = (fromFrame, toFrame, fromValue, toValue) => {
      const span = toFrame - fromFrame;
      const steps = easing === 'smooth' ? Number(span < 12n ? span : 12n) : 1;
      for (let i = 0; i <= steps; i += 1) {
        const frame = fromFrame + (span * BigInt(i)) / BigInt(steps);
        const t = Number(frame - fromFrame) / Number(span);
        const ratio = easing === 'smooth' ? t * t * (3 - 2 * t) : t;
        add(frame, fromValue + (toValue - fromValue) * ratio);
      }
    };
    if (motion === 'return') {
      const middle = movingFrames / 2n;
      ramp(0n, middle, base, elevated); ramp(middle, movingFrames, elevated, base);
    } else if (motion === 'out') {
      ramp(0n, movingFrames, elevated, base);
    } else {
      ramp(0n, movingFrames, base, elevated);
    }
    if (movingFrames < lastFrame) add(lastFrame, motion === 'in' ? elevated : base);
    return [...keys.values()];
  }
  async function scaleParameter(item) {
    const chain = await item.getComponentChain();
    for (let i = 0; i < chain.getComponentCount(); i += 1) {
      const component = chain.getComponentAtIndex(i);
      const matchName = await component.getMatchName();
      if (!/motion/i.test(matchName)) continue;
      for (let j = 0; j < component.getParamCount(); j += 1) {
        const param = component.getParam(j);
        if (/^(uniform )?scale$|^échelle( uniforme)?$|^echelle( uniforme)?$/i.test(param.displayName || '')) return param;
      }
    }
    return null;
  }
  async function applyMotion() {
    if (busy || mode === 'speaker') return;
    if (!host) { say('Cette commande fonctionne uniquement dans Premiere Pro.', 'error'); return; }
    busy = true; el('apply-zoom').setAttribute('aria-disabled', 'true');
    const config = { motion: mode === 'cuts' ? el('zoom-direction').value : preset.motion,
      amount: Number(el('zoom-increase').value), duration: Number(el('zoom-duration').value),
      easing: el('zoom-easing').value };
    say('Préparation des images clés…');
    try {
      const project = await host.Project.getActiveProject();
      const sequence = project && await project.getActiveSequence();
      if (!sequence) throw new Error('Aucune séquence active.');
      const selection = await sequence.getSelection();
      const items = selection ? await selection.getTrackItems() : [];
      if (!items.length) throw new Error('Sélectionne les clips vidéo à animer.');
      const frameTicks = BigInt(await sequence.getTimebase());
      const candidates = [], skipped = [];
      for (const item of items) {
        const name = await item.getName();
        try {
          const param = await scaleParameter(item);
          if (!param) continue; // Linked audio has no Motion scale.
          const trackIndex = await item.getTrackIndex();
          if (await item.isDisabled() || await item.isAdjustmentLayer()) throw new Error('clip désactivé ou calque d’effets');
          const clip = host.ClipProjectItem.cast(await item.getProjectItem());
          if (!clip || await clip.isSequence() || await clip.isMulticamClip() || await clip.isMergedClip()) throw new Error('clip composé');
          if (await param.isTimeVarying()) throw new Error('échelle déjà animée');
          if (!await param.areKeyframesSupported()) throw new Error('animation indisponible');
          const [start, end, sourceIn, sourceOut] = await Promise.all([
            item.getStartTime(), item.getEndTime(), item.getInPoint(), item.getOutPoint(),
          ]);
          if (await item.isSpeedReversed() || BigInt(end.ticks) - BigInt(start.ticks) !== BigInt(sourceOut.ticks) - BigInt(sourceIn.ticks)) throw new Error('vitesse modifiée');
          const current = await param.getStartValue();
          const raw = current && current.value;
          const scale = Number(raw && typeof raw === 'object' && 'value' in raw ? raw.value : raw);
          if (!Number.isFinite(scale) || scale <= 0) throw new Error('échelle illisible');
          candidates.push({ item, scale, trackIndex, start: BigInt(start.ticks),
            sourceIn: BigInt(sourceIn.ticks), sourceOut: BigInt(sourceOut.ticks) });
        } catch (error) { skipped.push(`${name} : ${error.message}`); }
      }
      candidates.sort((a, b) => a.trackIndex - b.trackIndex || (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
      const changes = [], perTrack = new Map();
      for (const clip of candidates) {
        const index = perTrack.get(clip.trackIndex) || 0;
        const motion = config.motion === 'alternate' ? (index % 2 === 0 ? 'in' : 'out') : config.motion;
        const keys = buildKeys(clip.scale, config.amount, clip.sourceIn, clip.sourceOut, frameTicks,
          config.duration, motion, config.easing);
        changes.push({ item: clip.item, keys }); perTrack.set(clip.trackIndex, index + 1);
      }
      if (!changes.length) throw new Error(`Aucun clip modifiable.${skipped.length ? ` ${skipped.join(' · ')}` : ''}`);
      const copier = require('./sequence-copy.cjs').withHost(host);
      const draft = await copier.create(project, sequence, changes.map((change) => change.item));
      const parameters = await Promise.all(draft.items.map(scaleParameter));
      if (parameters.some((param) => !param)) throw new Error('Trajectoire absente de la copie. Aucun zoom appliqué.');
      await copier.assertCopy(project, draft);
      let committed = false;
      project.lockedAccess(() => {
        // Build all actions first: an invalid action must not leave half a plan queued.
        const actions = [];
        actions.push(draft.projectItem.createSetNameAction(draft.name));
        for (let index = 0; index < changes.length; index += 1) {
          const change = changes[index], param = parameters[index];
          actions.push(param.createSetTimeVaryingAction(true));
          for (const point of change.keys) {
            const key = param.createKeyframe(point.value);
            key.position = host.TickTime.createWithTicks(point.ticks);
            actions.push(param.createAddKeyframeAction(key));
            actions.push(param.createSetInterpolationAtKeyframeAction(
              key.position, host.Constants.InterpolationMode.LINEAR, true,
            ));
          }
        }
        committed = project.executeTransaction((compound) => {
          for (const action of actions) {
            if (!compound.addAction(action)) throw new Error('Premiere a refusé une image clé.');
          }
        }, 'Nocturnz/Edit — Zoom animé');
      });
      if (!committed) throw new Error('Premiere n’a pas confirmé la transaction.');
      say(`${draft.name} · ${changes.length} clip(s) animé(s).${skipped.length ? ` ${skipped.length} ignoré(s) : ${skipped.join(' · ')}.` : ''}`, 'success');
    } catch (error) { say(error.message || 'Animation indisponible.', 'error'); }
    finally { busy = false; el('apply-zoom').setAttribute('aria-disabled', 'false'); }
  }
  window.NocturnzZoom = {
    usesMotion, applyMotion, buildKeys, presets, scaleParameter,
    acquire() {
      if (busy || el('apply-zoom').getAttribute('aria-disabled') === 'true') return false;
      busy = true; el('apply-zoom').setAttribute('aria-disabled', 'true'); return true;
    },
    release() { busy = false; el('apply-zoom').setAttribute('aria-disabled', 'false'); },
  };
  refresh();
})();
