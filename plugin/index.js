let entrypoints = null;
let calculateRelativeScale = null;
try {
  entrypoints = require('uxp').entrypoints;
  calculateRelativeScale = require('./zoom.cjs').calculateRelativeScale;
} catch (_) {}
const TICKS_PER_SECOND = 254016000000n;

let premiere;
try { premiere = require('premierepro'); } catch (_) { premiere = null; }

const $ = (id) => document.getElementById(id);
const status = (message, bad = false) => {
  $('notice').textContent = message;
  $('notice').style.color = bad ? 'var(--bad)' : 'var(--muted)';
};

async function readSequence() {
  if (!premiere) {
    status('L’API Premiere est disponible uniquement dans Premiere Pro.', true);
    return;
  }
  $('read-sequence').setAttribute('aria-disabled', 'true');
  $('sequence-results').hidden = true;
  status('Lecture de la séquence…');
  try {
    const project = await premiere.Project.getActiveProject();
    if (!project) throw new Error('Aucun projet Premiere ouvert.');
    const sequence = await project.getActiveSequence();
    if (!sequence) throw new Error('Aucune séquence active.');

    const [timebase, frameSize, trackCount] = await Promise.all([
      sequence.getTimebase(), sequence.getFrameSize(), sequence.getVideoTrackCount(),
    ]);
    const framesPerSecond = Number(TICKS_PER_SECOND) / Number(timebase);
    const tracks = [];
    for (let i = 0; i < trackCount; i += 1) {
      const track = await sequence.getVideoTrack(i);
      // Adobe documents TrackItemType.Clip as value 1.
      const clips = await track.getTrackItems(1, false);
      const items = await Promise.all(clips.map(async (clip) => {
        const [name, start, end] = await Promise.all([
          clip.getName(), clip.getStartTime(), clip.getEndTime(),
        ]);
        return { name, startTicks: start.ticks, endTicks: end.ticks };
      }));
      tracks.push({ name: track.name || `V${i + 1}`, items });
    }

    $('sequence-name').textContent = sequence.name || 'Séquence sans nom';
    $('sequence-meta').textContent = `${frameSize.width} × ${frameSize.height} · ${formatFrameRate(framesPerSecond)} i/s · ${trackCount} piste${trackCount > 1 ? 's' : ''} vidéo`;
    $('host-status').textContent = 'Connecté';
    $('host-dot').classList.add('online');
    const clipTotal = tracks.reduce((sum, track) => sum + track.items.length, 0);
    $('clip-total').textContent = `${clipTotal} clips · ${tracks.length} pistes`;
    $('track-list').textContent = tracks.map((track) => `${track.name} · ${track.items.length} clip${track.items.length > 1 ? 's' : ''}`).join('  /  ') || 'Aucune piste vidéo';
    $('sequence-results').hidden = false;
    status('');
  } catch (error) {
    $('host-status').textContent = 'La séquence active n’a pas pu être lue.';
    $('host-dot').classList.remove('online');
    status(error.message || 'Erreur de lecture Premiere.', true);
  } finally {
    $('read-sequence').setAttribute('aria-disabled', 'false');
  }
}

async function inspectSelection() {
  if (!premiere) {
    status('L’API Premiere est disponible uniquement dans Premiere Pro.', true);
    return;
  }
  $('inspect-selection').setAttribute('aria-disabled', 'true');
  const report = $('effect-report');
  while (report.firstChild) report.removeChild(report.firstChild);
  status('Lecture de la sélection…');
  try {
    const project = await premiere.Project.getActiveProject();
    const sequence = project && await project.getActiveSequence();
    if (!sequence) throw new Error('Aucune séquence active.');
    const selection = await sequence.getSelection();
    const items = selection ? await selection.getTrackItems() : [];
    if (!items.length) throw new Error('Sélectionne un clip vidéo dans la timeline.');

    const report = [];
    let componentTotal = 0;
    for (const item of items) {
      const name = await item.getName();
      const trackIndex = await item.getTrackIndex();
      const chain = await item.getComponentChain();
      const componentCount = chain.getComponentCount();
      report.push(`${name} · piste ${trackIndex + 1}`);

      for (let index = 0; index < componentCount; index += 1) {
        const component = chain.getComponentAtIndex(index);
        const [displayName, matchName] = await Promise.all([
          component.getDisplayName(), component.getMatchName(),
        ]);
        const paramCount = component.getParamCount();
        const paramNames = [];
        for (let paramIndex = 0; paramIndex < paramCount; paramIndex += 1) {
          const param = component.getParam(paramIndex);
          if (param && param.displayName) {
            let value = '';
            try {
              const keyframe = await param.getStartValue();
              if (keyframe && keyframe.value !== undefined) value = `: ${formatParamValue(keyframe.value)}`;
            } catch (_) {}
            paramNames.push(`${param.displayName}${value}`);
          }
        }
        report.push(`  ${displayName || `Effet ${index + 1}`} [${matchName}]: ${paramNames.join(' · ') || 'Aucun paramètre exposé'}`);
        componentTotal += 1;
      }
    }
    $('effect-report').textContent = report.join('\n');
    $('zoom-status').textContent = `${items.length} clip${items.length > 1 ? 's' : ''} sélectionné${items.length > 1 ? 's' : ''}.`;
    status(`${items.length} clip${items.length > 1 ? 's' : ''} lus · ${componentTotal} effet${componentTotal > 1 ? 's' : ''}. Aucune modification appliquée.`);
  } catch (error) {
    status(error.message || 'La sélection n’a pas pu être lue.', true);
  } finally {
    $('inspect-selection').setAttribute('aria-disabled', 'false');
  }
}

async function applyRelativeZoom() {
  const increase = Number($('zoom-increase').value);
  const zoomStatus = $('zoom-status');
  zoomStatus.className = 'tool-status';
  if (!Number.isFinite(increase) || increase < 1 || increase > 200) {
    zoomStatus.classList.add('error');
    zoomStatus.textContent = 'Choisis une intensité entre 1 et 200 %.';
    return;
  }
  if (!premiere) {
    zoomStatus.classList.add('error');
    zoomStatus.textContent = 'Cette commande fonctionne uniquement dans Premiere Pro.';
    return;
  }

  $('apply-zoom').setAttribute('aria-disabled', 'true');
  zoomStatus.textContent = 'Analyse de la sélection…';
  let stage = 'analyse de la sélection';
  try {
    const project = await premiere.Project.getActiveProject();
    const sequence = project && await project.getActiveSequence();
    if (!sequence) throw new Error('Aucune séquence active.');
    const selection = await sequence.getSelection();
    const items = selection ? await selection.getTrackItems() : [];
    if (!items.length) throw new Error('Sélectionne un clip vidéo dans la timeline.');

    const changes = [];
    let skipped = 0;
    for (const item of items) {
      const chain = await item.getComponentChain();
      let scaleParam = null;
      for (let index = 0; index < chain.getComponentCount(); index += 1) {
        const component = chain.getComponentAtIndex(index);
        const [displayName, matchName] = await Promise.all([
          component.getDisplayName(), component.getMatchName(),
        ]);
        if (!/motion|mouvement/i.test(`${displayName} ${matchName}`)) continue;
        for (let paramIndex = 0; paramIndex < component.getParamCount(); paramIndex += 1) {
          const param = component.getParam(paramIndex);
          if (/^(uniform )?scale$|^échelle( uniforme)?$|^echelle( uniforme)?$/i.test(param.displayName || '')) {
            scaleParam = param;
            break;
          }
        }
        if (scaleParam) break;
      }
      if (!scaleParam || await scaleParam.isTimeVarying()) {
        skipped += 1;
        continue;
      }
      const current = await scaleParam.getStartValue();
      const rawScale = current && current.value;
      const baseScale = Number(rawScale && typeof rawScale === 'object' && 'value' in rawScale ? rawScale.value : rawScale);
      if (!Number.isFinite(baseScale) || baseScale <= 0) {
        skipped += 1;
        continue;
      }
      changes.push({ item, value: calculateRelativeScale(baseScale, increase) });
    }

    if (!changes.length) {
      zoomStatus.classList.add('error');
      zoomStatus.textContent = `Aucun clip modifiable trouvé. ${skipped} ignoré(s): effet Mouvement absent, échelle animée ou valeur non prise en charge.`;
      return;
    }

    stage = 'duplication de la séquence';
    const copier = require('./sequence-copy.cjs').withHost(premiere);
    const draft = await copier.create(project, sequence, changes.map((change) => change.item));
    const parameters = await Promise.all(draft.items.map(window.NocturnzZoom.scaleParameter));
    if (parameters.some((param) => !param)) throw new Error('Trajectoire absente de la copie. Aucun zoom appliqué.');
    await copier.assertCopy(project, draft);
    let added = 0;
    let success = false;
    stage = 'création de la transaction Premiere';
    project.lockedAccess(() => {
      success = project.executeTransaction((compoundAction) => {
        if (!compoundAction.addAction(draft.projectItem.createSetNameAction(draft.name))) throw new Error('Nommage de la copie refusé.');
        for (let index = 0; index < changes.length; index += 1) {
          const param = parameters[index];
          const keyframe = param.createKeyframe(changes[index].value);
          const action = param.createSetValueAction(keyframe, true);
          if (compoundAction.addAction(action)) added += 1;
        }
      }, 'Nocturnz/Edit — Zoom relatif');
    });
    if (!success || added !== changes.length) throw new Error('Premiere n’a pas confirmé toutes les actions. Aucun résultat n’est annoncé.');

    zoomStatus.classList.add('success');
    zoomStatus.textContent = `${draft.name} · ${added} clip(s) zoomé(s).${skipped ? ` ${skipped} ignoré(s).` : ''}`;
  } catch (error) {
    zoomStatus.classList.add('error');
    zoomStatus.textContent = `${error.message || 'Le zoom n’a pas pu être appliqué.'} · Étape : ${stage}.`;
  } finally {
    $('apply-zoom').setAttribute('aria-disabled', 'false');
  }
}

function formatParamValue(value) {
  if (typeof value === 'object' && value !== null) {
    try { return JSON.stringify(value); } catch (_) { return '[valeur]'; }
  }
  return String(value);
}

function setZoomInput(value) {
  const normalized = Math.max(1, Math.min(200, Math.round(Number(value) || 1)));
  $('zoom-increase').value = String(normalized);
  $('zoom-range').value = String(normalized);
  $('zoom-value').textContent = `${normalized} %`;
  document.querySelectorAll('[data-zoom]').forEach((button) => {
    button.classList.toggle('is-active', Number(button.dataset.zoom) === normalized);
  });
}

function formatFrameRate(rate) {
  if (!Number.isFinite(rate) || rate <= 0) return 'Cadence inconnue';
  return Number(rate.toFixed(3)).toString();
}

function formatTimestamp(ticks) {
  let milliseconds;
  try {
    milliseconds = Number((BigInt(ticks) * 1000n + TICKS_PER_SECOND / 2n) / TICKS_PER_SECOND);
  } catch (_) {
    return '—';
  }
  const hours = Math.floor(milliseconds / 3600000);
  milliseconds %= 3600000;
  const minutes = Math.floor(milliseconds / 60000);
  milliseconds %= 60000;
  const seconds = Math.floor(milliseconds / 1000);
  const millis = milliseconds % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

async function checkService() {
  $('check-service').setAttribute('aria-disabled', 'true');
  $('service-state').textContent = 'Connexion…';
  $('service-state').className = 'service-state';
  try {
    const response = await fetch('http://localhost:8765/health');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    $('service-state').textContent = 'En ligne';
    $('service-state').className = 'service-state online';
    $('service-detail').textContent = `v${data.version}`;
  } catch (_) {
    $('service-state').textContent = 'Hors ligne';
    $('service-state').className = 'service-state offline';
    $('service-detail').textContent = '';
  } finally {
    $('check-service').setAttribute('aria-disabled', 'false');
  }
}

$('read-sequence').addEventListener('click', () => {
  if ($('read-sequence').getAttribute('aria-disabled') !== 'true') readSequence();
});
$('read-sequence').addEventListener('keydown', (event) => {
  if ((event.key === 'Enter' || event.key === ' ') && $('read-sequence').getAttribute('aria-disabled') !== 'true') {
    event.preventDefault();
    readSequence();
  }
});
bindNavigation($('inspect-selection'), () => {
  if ($('inspect-selection').getAttribute('aria-disabled') !== 'true') inspectSelection();
});
$('apply-zoom').addEventListener('click', () => {
  if ($('apply-zoom').getAttribute('aria-disabled') !== 'true') applySelectedZoom();
});
$('apply-zoom').addEventListener('keydown', (event) => {
  if ((event.key === 'Enter' || event.key === ' ') && $('apply-zoom').getAttribute('aria-disabled') !== 'true') {
    event.preventDefault();
    applySelectedZoom();
  }
});
function applySelectedZoom() {
  if (window.NocturnzZoom && window.NocturnzZoom.usesMotion()) return window.NocturnzZoom.applyMotion();
  return applyRelativeZoom();
}
bindNavigation($('check-service'), () => {
  if ($('check-service').getAttribute('aria-disabled') !== 'true') checkService();
});
$('zoom-range').addEventListener('input', (event) => setZoomInput(event.target.value));
$('zoom-increase').addEventListener('input', (event) => setZoomInput(event.target.value));
document.querySelectorAll('[data-zoom]').forEach((button) => {
  const choose = () => setZoomInput(button.dataset.zoom);
  button.addEventListener('click', choose);
  button.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(); }
  });
});
function bindNavigation(element, action) {
  element.addEventListener('click', action);
  element.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      action();
    }
  });
}

function showView(selected) {
  ['home-view', 'tool-view', 'settings-view'].forEach((id) => {
    $(id).hidden = id !== selected;
  });
  $('workspace').scrollTop = 0;
  status('');
}

document.querySelectorAll('[data-tool]').forEach((tile) => {
  bindNavigation(tile, () => {
    const tool = tile.dataset.tool;
    $('tool-title').textContent = tile.dataset.title;
    $('tool-icon').src = `icons/${tool}.svg`;
    $('zoom-controls').hidden = tool !== 'zooms';
    $('silence-controls').hidden = tool !== 'silences';
    $('pending-state').hidden = tool === 'zooms' || tool === 'silences';
    showView('tool-view');
  });
});
document.querySelectorAll('[data-home]').forEach((control) => {
  bindNavigation(control, () => showView('home-view'));
});
bindNavigation($('open-settings'), () => showView('settings-view'));

if (entrypoints) entrypoints.setup({
  panels: {
    montage: {
      show() {
        $('host-status').textContent = premiere ? 'Connecté à Premiere' : 'Premiere déconnecté';
        $('host-dot').classList.toggle('online', Boolean(premiere));
      },
    },
  },
});
