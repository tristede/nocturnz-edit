"""User-facing operations backed by the pinned OpenCut source snapshot."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PYTHON = ROOT / '.runtime/modules-venv' / ('Scripts/python.exe' if __import__('os').name == 'nt' else 'bin/python')


def field(key, label, kind='number', default=None, **extra):
    return dict(key=key, label=label, type=kind, default=default, **extra)


LANGUAGE = field('language', 'Langue', 'select', 'fr', choices=['fr', 'ar', 'en', 'auto'])
MODEL = field('model', 'Modèle', 'select', 'base', choices=['tiny', 'base', 'small'])
TRANSCRIPT = field('transcript', 'Transcription JSON', 'file', '', extensions=['json'], optional=True)

MODULES = {
    'transcription': dict(title='Transcription', action='Transcrire', fields=[LANGUAGE, MODEL], upstream=['captions.transcribe']),
    'hesitations': dict(title='Hésitations', action='Détecter', fields=[TRANSCRIPT, LANGUAGE, MODEL,
        field('words', 'Mots à retirer', 'text', 'euh,heu,hum')], upstream=['fillers.detect_fillers', 'premiere.export_premiere_xml_from_cuts']),
    'repetitions': dict(title='Répétitions', action='Détecter', fields=[TRANSCRIPT, LANGUAGE, MODEL,
        field('threshold', 'Similarité', default=0.6, min=0.1, max=1, step=0.05)], upstream=['repeat_detect.detect_repeated_takes']),
    'captions': dict(title='Sous-titres', action='Générer', fields=[TRANSCRIPT, LANGUAGE, MODEL,
        field('format', 'Format', 'select', 'srt', choices=['srt', 'vtt', 'ass', 'animated']),
        field('style', 'Style animé', 'text', 'default')], upstream=['export.srt', 'styled_captions.render_styled_caption_video']),
    'podcast': dict(title='Podcast', action='Préparer le montage', multiple=True, fields=[
        field('segments', 'Prises de parole JSON', 'file', '', extensions=['json'], optional=True),
        field('minCut', 'Plan minimum (s)', default=1, min=0.2, max=60, step=0.1)],
        upstream=['audio.analyze_energy', 'multicam.generate_multicam_cuts']),
    'cadrages': dict(title='Cadrages', action='Créer le rendu', multiple=True, fields=[
        field('layout', 'Disposition', 'select', 'side_by_side', choices=['side_by_side', '2x2_grid', 'pip_top_right']),
        field('width', 'Largeur', default=1920, min=128, max=7680), field('height', 'Hauteur', default=1080, min=128, max=7680)],
        upstream=['split_screen.create_split_screen', 'multicam_grid.export_multicam_grid']),
    'recadrage': dict(title='Recadrage', action='Créer le rendu', fields=[
        field('aspect', 'Format', 'select', '9:16', choices=['9:16', '1:1', '4:5', '16:9']),
        field('method', 'Cadrage', 'select', 'center', choices=['center', 'auto', 'face'])], upstream=['smart_reframe.reframe_vertical']),
    'shorts': dict(title='Shorts', action='Proposer les extraits', fields=[TRANSCRIPT, LANGUAGE, MODEL,
        field('selection', 'Sélection', 'select', 'heuristic', choices=['heuristic', 'ollama']),
        field('count', 'Extraits', default=3, min=1, max=20), field('minDuration', 'Durée minimum (s)', default=15, min=1, max=300),
        field('maxDuration', 'Durée maximum (s)', default=60, min=1, max=600)], upstream=['highlights.extract_highlights']),
    'chapitres': dict(title='Chapitres', action='Générer', fields=[TRANSCRIPT, LANGUAGE, MODEL,
        field('count', 'Chapitres maximum', default=15, min=1, max=100),
        field('minDuration', 'Durée minimum (s)', default=30, min=1, max=3600)], upstream=['chapter_gen.generate_chapters']),
    'broll': dict(title='B-roll', action='Proposer les plans', fields=[TRANSCRIPT, LANGUAGE, MODEL,
        field('footage', 'Plans disponibles', 'files', [], optional=True), field('count', 'Suggestions', default=20, min=1, max=100)],
        upstream=['broll_suggest.suggest_broll']),
    'audio': dict(title='Audio', action='Créer le rendu', fields=[
        field('operation', 'Traitement', 'select', 'normalize', choices=['normalize', 'denoise', 'duck']),
        field('lufs', 'Niveau LUFS', default=-14, min=-70, max=-1),
        field('music', 'Musique pour ducking', 'file', '', optional=True)],
        upstream=['loudness_match.normalize_to_lufs', 'audio_duck.mix_with_duck']),
    'musique': dict(title='Musique', action='Créer le rendu', sourceOptional=True, fields=[
        field('operation', 'Traitement', 'select', 'fit', choices=['fit', 'tone', 'sfx']),
        field('duration', 'Durée cible (s)', default=30, min=0.1, max=14400, step=0.1),
        field('frequency', 'Fréquence (Hz)', default=440, min=20, max=20000),
        field('preset', 'Effet sonore', 'select', 'swoosh', choices=['swoosh', 'rise', 'impact', 'click'])],
        upstream=['music_remix.fit_music_to_duration', 'music_gen.generate_tone', 'music_gen.generate_sfx']),
    'censure': dict(title='Censure', action='Créer le rendu', fields=[TRANSCRIPT, LANGUAGE, MODEL,
        field('operation', 'Traitement', 'select', 'bleep', choices=['bleep', 'mute', 'faces']),
        field('words', 'Mots à censurer', 'text', '')], upstream=['profanity_censor.censor', 'redaction.redact_faces']),
    'recettes': dict(title='Recettes', action='Exécuter la recette', fields=[
        field('recipe', 'Recette', 'select', 'interview', choices=['interview', 'social', 'audio']), LANGUAGE, MODEL],
        upstream=['macro_recorder.play_macro']),
    'lots': dict(title='Traitement par lot', action='Lancer le lot', multiple=True, fields=[
        field('module', 'Outil', 'select', 'transcription', choices=['transcription', 'captions', 'recadrage', 'audio', 'chapitres', 'hesitations', 'repetitions']),
        LANGUAGE, MODEL], upstream=['batch_process.create_batch', 'batch_process.update_batch_item', 'batch_process.finalize_batch']),
}


def catalog():
    import json
    try:
        diagnostic = json.loads((ROOT / '.runtime/modules-diagnostics.json').read_text())
    except (OSError, ValueError):
        diagnostic = {}
    return {'runtimeInstalled': PYTHON.is_file(), 'diagnostics': diagnostic, 'modules': [dict(id=key, connected=True,
        nativeValidated=False, **value) for key, value in MODULES.items()]}


def validate(module, payload):
    if module not in MODULES:
        raise ValueError('Module inconnu.')
    spec = MODULES[module]
    if set(payload) - {'paths', 'options'}:
        raise ValueError('Paramètre inconnu.')
    paths = payload.get('paths', [])
    if not isinstance(paths, list) or len(paths) > 100:
        raise ValueError('Choisis au maximum 100 médias.')

    def local_file(raw):
        if not isinstance(raw, str) or not Path(raw).is_absolute():
            raise ValueError('Fichier local absolu requis.')
        path = Path(raw).resolve(strict=True)
        if not path.is_file() or path.suffix.lower() not in ('.wav', '.mp3', '.mp4', '.mov', '.m4a', '.mkv', '.aiff', '.aif', '.flac', '.webm', '.mxf', '.json'):
            raise ValueError('Format de source non pris en charge.')
        return str(path)

    paths = [local_file(path) for path in paths]
    if not paths and not spec.get('sourceOptional'):
        raise ValueError('Choisis un média source.')
    if not spec.get('multiple') and len(paths) > 1:
        raise ValueError('Ce module traite une seule source.')
    raw = payload.get('options', {})
    if not isinstance(raw, dict) or set(raw) - {f['key'] for f in spec['fields']}:
        raise ValueError('Réglage inconnu.')
    options = {}
    for f in spec['fields']:
        value = raw.get(f['key'], f['default'])
        if f['type'] == 'number':
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not __import__('math').isfinite(value) or not f.get('min', -1e6) <= value <= f.get('max', 1e6):
                raise ValueError(f"Valeur invalide : {f['label']}.")
        elif f['type'] == 'select':
            if value not in f['choices']:
                raise ValueError(f"Choix invalide : {f['label']}.")
        elif f['type'] == 'file':
            value = local_file(value) if value else ''
        elif f['type'] == 'files':
            if not isinstance(value, list) or len(value) > 100:
                raise ValueError('Liste de fichiers invalide.')
            value = [local_file(path) for path in value]
        elif not isinstance(value, str) or len(value) > 4000:
            raise ValueError('Texte invalide.')
        options[f['key']] = value
    return {'module': module, 'paths': paths, 'options': options}
