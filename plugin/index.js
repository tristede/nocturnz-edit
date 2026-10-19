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
