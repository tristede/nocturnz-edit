const { entrypoints } = require('uxp');

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
  $('read-sequence').disabled = true;
  status('Lecture de la séquence…');
  try {
    const project = await premiere.Project.getActiveProject();
    if (!project) throw new Error('Aucun projet Premiere ouvert.');
    const sequence = await project.getActiveSequence();
    if (!sequence) throw new Error('Aucune séquence active.');

    const [timebase, frameSize, trackCount] = await Promise.all([
      sequence.getTimebase(), sequence.getFrameSize(), sequence.getVideoTrackCount(),
    ]);
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
    $('sequence-meta').textContent = `${frameSize.width} × ${frameSize.height} · base Premiere ${timebase} · ${trackCount} piste${trackCount > 1 ? 's' : ''} vidéo`;
    $('host-status').textContent = 'Premiere est connecté. Aucune modification appliquée.';
    $('host-dot').classList.add('online');
    $('track-list').innerHTML = tracks.map((track, index) =>
      `<div class="track-row"><span>${escapeHtml(track.name || `V${index + 1}`)}</span><span>${track.items.length} clip${track.items.length > 1 ? 's' : ''}</span></div>`
    ).join('') || '<div class="track-row"><span>Aucune piste vidéo</span><span>—</span></div>';
    status(`Lecture terminée · ${tracks.reduce((sum, track) => sum + track.items.length, 0)} clips lus.`);
  } catch (error) {
    $('host-status').textContent = 'La séquence active n’a pas pu être lue.';
    $('host-dot').classList.remove('online');
    status(error.message || 'Erreur de lecture Premiere.', true);
  } finally {
    $('read-sequence').disabled = false;
  }
}

async function inspectSelection() {
  if (!premiere) {
    status('L’API Premiere est disponible uniquement dans Premiere Pro.', true);
    return;
  }
  $('inspect-selection').disabled = true;
  $('effect-report').replaceChildren();
  status('Lecture de la sélection…');
  try {
    const project = await premiere.Project.getActiveProject();
    const sequence = project && await project.getActiveSequence();
    if (!sequence) throw new Error('Aucune séquence active.');
    const selection = await sequence.getSelection();
    const items = selection ? await selection.getTrackItems() : [];
    if (!items.length) throw new Error('Sélectionne un clip vidéo dans la timeline.');

    let componentTotal = 0;
    for (const item of items) {
      const name = await item.getName();
      const trackIndex = await item.getTrackIndex();
      const chain = await item.getComponentChain();
      const componentCount = chain.getComponentCount();
      const heading = document.createElement('p');
      heading.className = 'effect-title';
      heading.textContent = `${name} · piste ${trackIndex + 1}`;
      $('effect-report').appendChild(heading);

      for (let index = 0; index < componentCount; index += 1) {
        const component = chain.getComponentAtIndex(index);
        const [displayName, matchName] = await Promise.all([
          component.getDisplayName(), component.getMatchName(),
        ]);
        const paramCount = component.getParamCount();
        const paramNames = [];
        for (let paramIndex = 0; paramIndex < paramCount; paramIndex += 1) {
          const param = component.getParam(paramIndex);
          if (param && param.displayName) paramNames.push(param.displayName);
        }
        const block = document.createElement('div');
        block.className = 'effect-block';
        const title = document.createElement('p');
        title.className = 'effect-title';
        title.textContent = displayName || matchName || `Effet ${index + 1}`;
        const params = document.createElement('p');
        params.className = 'effect-params';
        params.textContent = paramNames.join(' · ') || 'Aucun paramètre exposé';
        block.append(title, params);
        $('effect-report').appendChild(block);
        componentTotal += 1;
      }
    }
    status(`${items.length} clip${items.length > 1 ? 's' : ''} lus · ${componentTotal} effet${componentTotal > 1 ? 's' : ''}. Aucune modification appliquée.`);
  } catch (error) {
    status(error.message || 'La sélection n’a pas pu être lue.', true);
  } finally {
    $('inspect-selection').disabled = false;
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

async function checkService() {
  $('check-service').disabled = true;
  $('service-state').textContent = 'Connexion…';
  $('service-state').className = 'service-state';
  try {
    const response = await fetch('http://127.0.0.1:8765/health');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    $('service-state').textContent = 'En ligne';
    $('service-state').className = 'service-state online';
    $('service-detail').textContent = `Service local ${data.version} disponible. Aucun moteur média installé.`;
  } catch (_) {
    $('service-state').textContent = 'Hors ligne';
    $('service-state').className = 'service-state offline';
    $('service-detail').textContent = 'Lance service/server.py depuis le dossier du projet pour vérifier la connexion.';
  } finally {
    $('check-service').disabled = false;
  }
}

$('read-sequence').addEventListener('click', readSequence);
$('inspect-selection').addEventListener('click', inspectSelection);
$('check-service').addEventListener('click', checkService);

entrypoints.setup({
  panels: {
    montage: {
      show() {
        $('host-status').textContent = premiere
          ? 'Prêt à lire la séquence active.'
          : 'Ouvre ce panneau depuis Premiere Pro pour lire une séquence.';
      },
    },
  },
});
