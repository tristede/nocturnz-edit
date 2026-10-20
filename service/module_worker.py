"""Isolated adapter for pinned upstream functions. No Premiere project writes."""
import dataclasses
import json
import math
import os
from pathlib import Path
import sys
import traceback

ROOT = Path(__file__).resolve().parents[1]
os.environ['OPENCUT_HOME'] = str(ROOT / '.runtime/opencut')
os.environ['OPENCUT_LOCAL_ONLY'] = '1'
os.environ['HF_HOME'] = str(ROOT / '.runtime/huggingface')
os.environ['PATH'] = str(ROOT / '.runtime/toolchain/bin') + os.pathsep + os.environ.get('PATH', '')
sys.path.insert(0, str(ROOT / 'vendor/sources/opencut'))
sys.path.insert(0, str(ROOT))


def plain(value):
    if dataclasses.is_dataclass(value):
        return {key: plain(item) for key, item in dataclasses.asdict(value).items()}
    if isinstance(value, dict):
        return {str(key): plain(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [plain(item) for item in value]
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value


def progress(percent=0, message=''):
    print(json.dumps({'progress': max(0, min(100, int(percent))), 'message': str(message)[:500]}), flush=True)


def load_json(path):
    path = Path(path)
    if path.stat().st_size > 16 * 1024 * 1024:
        raise ValueError('JSON trop volumineux (16 Mio maximum).')
    return json.loads(path.read_text(encoding='utf-8-sig'))


def write_json(path, data):
    path.write_text(json.dumps(plain(data), ensure_ascii=False, indent=2, allow_nan=False))
    return str(path)


def transcript(source, options, directory):
    from opencut.core.captions import transcribe, transcription_result_from_dict, transcription_result_to_dict
    from opencut.utils.config import CaptionConfig
    if options.get('transcript'):
        data = load_json(options['transcript'])
        if not isinstance(data, dict) or not isinstance(data.get('segments'), list):
            raise ValueError('Transcription attendue : objet JSON avec segments horodatés.')
        result = transcription_result_from_dict(data)
    else:
        model = ROOT / '.runtime/models' / options.get('model', 'base')
        if not (model / 'model.bin').is_file():
            raise RuntimeError(f'Modèle absent : lance python3 scripts/install-modules.py --model {model.name}.')
        progress(10, 'Transcription locale…')
        config = CaptionConfig(engine='faster-whisper', model=str(model),
            language=None if options.get('language') == 'auto' else options.get('language', 'fr'),
            word_timestamps=True, batched=False)
        result = transcribe(source, config=config, use_cache=False)
    data = transcription_result_to_dict(result)
    write_json(directory / 'transcription.json', data)
    return result, data['segments']


def run(module, paths, options, directory):
    directory.mkdir(parents=True, exist_ok=True)
    source = paths[0] if paths else None
    progress(2, module)
    if module == 'speakerzoom':
        from service.speaker_analysis import analyze_speakers
        result = analyze_speakers(options, progress)
        write_json(directory / 'intervenants.json', result)
        return result
    if module == 'reviewcuts':
        from opencut.export.premiere import export_premiere_xml_from_cuts
        return export_premiere_xml_from_cuts(source, options['cuts'], str(directory / 'montage-revise.xml'),
            sequence_name='Nocturnz — Coupes révisées')
    if module in ('transcription', 'hesitations', 'repetitions', 'captions', 'shorts', 'chapitres', 'broll') or (module == 'censure' and options.get('operation') != 'faces'):
        result, segments = transcript(source, options, directory)
    if module == 'transcription':
        return {'segments': segments, 'language': result.language}
    if module in ('hesitations', 'repetitions'):
        if module == 'hesitations':
            from opencut.core.fillers import detect_fillers
            analysis = detect_fillers(result, include_context_fillers=False,
                custom_words=[word.strip() for word in options.get('words', 'euh,heu,hum').split(',') if word.strip()])
            cuts = [{'start': hit.start, 'end': hit.end, 'text': hit.text} for hit in analysis.hits]
            data = plain(analysis)
        else:
            from opencut.core.repeat_detect import detect_repeated_takes, merge_repeat_ranges
            data = detect_repeated_takes(segments, threshold=options.get('threshold', 0.6))
            cuts = merge_repeat_ranges(data.get('repeats', []))
        write_json(directory / 'propositions.json', {'cuts': cuts, 'analysis': data})
        return {'reviewRequired': True, 'cuts': cuts, 'analysis': data}
    if module == 'captions':
        from opencut.export import srt
        format_name = options.get('format', 'srt')
        if format_name == 'animated':
            from opencut.core.styled_captions import render_styled_caption_video, STYLES
            from opencut.utils.media import probe
            info = probe(source)
            if not info.video:
                raise ValueError('Le rendu animé demande une source vidéo.')
            STYLES['nocturnz'] = dataclasses.replace(STYLES['clean_modern'], name='nocturnz', label='Nocturnz',
                highlight_color=(203,179,236,255), action_color=(203,179,236,255))
            return render_styled_caption_video(result, str(directory / 'sous-titres.mov'),
                style_name=options.get('style', 'nocturnz'), video_width=info.video.width,
                video_height=info.video.height, fps=info.video.fps, total_duration=info.duration, on_progress=progress)
        return getattr(srt, 'export_' + format_name)(result, str(directory / ('sous-titres.' + format_name)))
    if module == 'podcast':
        from opencut.core.multicam import generate_multicam_cuts
        if options.get('segments'):
            data = load_json(options['segments'])
            segments = data.get('segments', []) if isinstance(data, dict) else data
        else:
            from opencut.core.audio import analyze_energy
            if len(paths) < 2:
                raise ValueError('Choisis au moins deux prises synchronisées, une par interlocuteur, ou un JSON de prises de parole.')
            energies = [analyze_energy(path, window_size=0.25, hop_size=0.25) for path in paths]
            segments = []
            for index in range(min(map(len, energies))):
                winner = max(range(len(energies)), key=lambda camera: energies[camera][index].rms)
                entry = energies[winner][index]
                segments.append({'speaker': str(winner), 'start': entry.time, 'end': entry.time + 0.25})
        if not isinstance(segments, list) or len(segments) > 200000:
            raise ValueError('Prises de parole invalides.')
        speakers = list(dict.fromkeys(str(seg.get('speaker', '')) for seg in segments))
        mapping = {speaker: index for index, speaker in enumerate(speakers)}
        if len(mapping) > len(paths):
            raise ValueError('Il manque une source caméra pour un interlocuteur.')
        data = generate_multicam_cuts(segments, speaker_to_track=mapping, min_cut_duration=options.get('minCut', 1))
        write_json(directory / 'montage-podcast.json', data)
        from service.module_xml import podcast_xml
        podcast_xml(paths, data['cuts'], directory / 'podcast.xml')
        return data
    if module == 'cadrages':
        if len(paths) < 2 or len(paths) > 4:
            raise ValueError('Choisis deux à quatre vidéos synchronisées.')
        if options.get('layout') == 'grid':
            from opencut.core.multicam_grid import export_multicam_grid
            return export_multicam_grid(paths, output_width=int(options.get('width', 1920)),
                output_height=int(options.get('height', 1080)), show_timecode=False, show_audio_meters=False,
                output_path_str=str(directory / 'grille.mp4'), on_progress=progress)
        from opencut.core.split_screen import create_split_screen
        return create_split_screen(paths, layout_name=options.get('layout', 'side_by_side'),
            output_width=int(options.get('width', 1920)), output_height=int(options.get('height', 1080)),
            output_path_str=str(directory / 'cadrages.mp4'), on_progress=progress)
    if module == 'recadrage':
        from opencut.core.smart_reframe import reframe_vertical
        return reframe_vertical(source, target_aspect=options.get('aspect', '9:16'), method=options.get('method', 'center'),
            output_path_str=str(directory / 'recadrage.mp4'), on_progress=progress)
    if module == 'shorts':
        from opencut.core.highlights import extract_highlights
        from opencut.core.llm import LLMConfig
        low, high = options.get('minDuration', 15), options.get('maxDuration', 60)
        if high < low:
            raise ValueError('La durée maximum doit dépasser la durée minimum.')
        data = extract_highlights(segments, max_highlights=int(options.get('count', 3)), min_duration=low,
            max_duration=high, llm_config=LLMConfig(provider='ollama'), on_progress=progress) if options.get('selection') == 'ollama' else None
        if data is None:
            from opencut.core.highlights import Highlight, HighlightResult, _score_engagement
            candidates = []
            for index, seg in enumerate(segments):
                end = min(float(seg['start']) + high, float(segments[-1]['end']))
                if end - float(seg['start']) < low:
                    continue
                highlight = Highlight(start=float(seg['start']), end=end, title=seg.get('text', '')[:80], reason='Classement heuristique local')
                highlight.engagement = _score_engagement(highlight, segments)
                highlight.score = highlight.engagement.overall
                candidates.append(highlight)
            chosen = []
            for candidate in sorted(candidates, key=lambda item: item.score, reverse=True):
                if all(candidate.end <= other.start or candidate.start >= other.end for other in chosen):
                    chosen.append(candidate)
                if len(chosen) >= int(options.get('count', 3)):
                    break
            data = HighlightResult(highlights=chosen, total_found=len(candidates))
        write_json(directory / 'extraits.json', data)
        if not data.highlights:
            raise RuntimeError('Aucun extrait proposé : démarre Ollama avec llama3.2 pour la sélection sémantique locale, ou utilise un autre média.')
        from service.module_xml import ranges_xml
        ranges_xml(source, [{'start': clip.start, 'end': clip.end} for clip in data.highlights], directory / 'shorts.xml')
        return data
    if module == 'chapitres':
        from opencut.core.chapter_gen import generate_chapters
        from opencut.core.llm import LLMConfig
        data = generate_chapters(segments, llm_config=LLMConfig(provider='ollama'),
            max_chapters=int(options.get('count', 15)), min_chapter_duration=options.get('minDuration', 30))
        (directory / 'chapitres.txt').write_text(data.get('description_block', ''), encoding='utf-8')
        write_json(directory / 'chapitres.json', data)
        return data
    if module == 'broll':
        from opencut.core.broll_suggest import suggest_broll
        from opencut.utils.media import probe
        index = [{'path': path, 'name': Path(path).stem, 'duration': probe(path).duration} for path in options.get('footage', [])]
        data = suggest_broll(segments, footage_index=index, max_results=int(options.get('count', 20)), on_progress=progress)
        write_json(directory / 'broll.json', data)
        return {'reviewRequired': True, 'suggestions': plain(data)}
    if module == 'audio':
        operation = options.get('operation', 'normalize')
        if operation == 'normalize':
            from opencut.core.loudness_match import normalize_to_lufs
            return normalize_to_lufs(source, str(directory / 'audio.wav'), target_lufs=options.get('lufs', -14))
        if operation == 'duck':
            from opencut.core.audio_duck import mix_with_duck
            if not options.get('music'):
                raise ValueError('Choisis la musique pour le ducking.')
            return mix_with_duck(source, options['music'], output_path=str(directory / 'mix.wav'), on_progress=progress)
        from opencut.helpers import get_ffmpeg_path, run_ffmpeg
        target = str(directory / 'audio-nettoye.wav')
        run_ffmpeg([get_ffmpeg_path(), '-nostdin', '-i', source, '-vn', '-af', 'afftdn', target])
        return target
    if module == 'musique':
        operation = options.get('operation', 'fit')
        if operation == 'fit':
            if not source:
                raise ValueError('Choisis une musique à adapter.')
            from opencut.core.music_remix import fit_music_to_duration
            return fit_music_to_duration(source, options.get('duration', 30), output_path=str(directory / 'musique.wav'), on_progress=progress)
        from opencut.core.music_gen import generate_tone, generate_sfx
        if operation == 'tone':
            return generate_tone(output_path=str(directory / 'ton.wav'), frequency=options.get('frequency', 440), duration=options.get('duration', 30), on_progress=progress)
        return generate_sfx(preset=options.get('preset', 'swoosh'), output_path=str(directory / 'effet.wav'), duration=options.get('duration', 1), on_progress=progress)
    if module == 'censure':
        if options.get('operation') == 'faces':
            from opencut.core.redaction import redact_faces
            return redact_faces(source, output_path_str=str(directory / 'visages.mp4'), on_progress=progress)
        from opencut.core.profanity_censor import censor
        words = [{'word': word.get('text', word.get('word', '')), 'start': word['start'], 'end': word['end']}
                 for seg in segments for word in seg.get('words', [])]
        custom = [word.strip() for word in options.get('words', '').split(',') if word.strip()]
        data = censor(source, words, mode=options.get('operation', 'bleep'), custom_words=custom or None,
            output=str(directory / 'censure.wav'), on_progress=progress)
        from opencut.utils.media import probe
        if probe(source).video:
            from opencut.helpers import get_ffmpeg_path, run_ffmpeg
            run_ffmpeg([get_ffmpeg_path(), '-nostdin', '-i', source, '-i', str(directory / 'censure.wav'),
                '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-shortest', str(directory / 'censure.mp4')])
        return data
    if module == 'recettes':
        from opencut.core.macro_recorder import MacroRecording, MacroStep, play_macro
        recipe = {'interview': ['audio', 'transcription', 'hesitations', 'repetitions', 'chapitres'],
                  'social': ['transcription', 'captions', 'recadrage'], 'audio': ['audio']}[options.get('recipe', 'interview')]
        macro = MacroRecording(name='Nocturnz ' + options.get('recipe', 'interview'),
            steps=[MacroStep(endpoint=key, payload={}) for key in recipe])
        def execute(endpoint, method, payload):
            child = directory / endpoint
            child_options = dict(options)
            cached = directory / 'transcription/transcription.json'
            if cached.is_file():
                child_options['transcript'] = str(cached)
            return run(endpoint, paths, child_options, child)
        steps = play_macro(macro, target_file=source, output_dir=str(directory), executor=execute, on_progress=progress)
        return {'steps': steps, 'failed': sum(not step.get('success') for step in steps)}
    if module == 'lots':
        from opencut.core.batch_process import create_batch, update_batch_item, finalize_batch
        operation = options.get('module', 'transcription')
        batch = create_batch(directory.name, operation, paths, params=options)
        results = []
        for index, path in enumerate(paths):
            update_batch_item(batch.batch_id, index, status='running')
            try:
                data = run(operation, [path], options, directory / f'{index + 1:03d}')
                update_batch_item(batch.batch_id, index, status='complete', progress=100)
                results.append({'path': path, 'status': 'complete', 'result': plain(data)})
            except Exception as error:
                update_batch_item(batch.batch_id, index, status='error', error=str(error))
                results.append({'path': path, 'status': 'failed', 'error': str(error)})
            progress((index + 1) * 100 / len(paths), f'{index + 1}/{len(paths)}')
        finalize_batch(batch.batch_id)
        return {'items': results, 'failed': sum(item['status'] == 'failed' for item in results)}
    raise ValueError('Module inconnu.')


if __name__ == '__main__':
    if len(sys.argv) == 2 and sys.argv[1] == '--diagnostics':
        import importlib
        from opencut.helpers import get_ffmpeg_path, get_ffprobe_path
        from opencut.core.ffmpeg_provenance import probe_binary_security
        from service.module_catalog import MODULES
        diagnostic = {'modules': {}, 'ffmpeg': probe_binary_security(get_ffmpeg_path()),
            'ffprobe': probe_binary_security(get_ffprobe_path()),
            'models': [model for model in ('tiny', 'base', 'small') if (ROOT / '.runtime/models' / model / 'model.bin').is_file()]}
        imports = ['captions', 'fillers', 'repeat_detect', 'multicam', 'split_screen', 'smart_reframe', 'highlights',
            'chapter_gen', 'broll_suggest', 'loudness_match', 'audio_duck', 'music_remix', 'music_gen',
            'profanity_censor', 'redaction', 'macro_recorder', 'batch_process', 'styled_captions']
        for name in imports:
            importlib.import_module('opencut.core.' + name)
        diagnostic['modules'] = {key: 'importable' for key in MODULES}
        write_json(ROOT / '.runtime/modules-diagnostics.json', diagnostic)
        print(json.dumps({'modules': len(MODULES), 'models': diagnostic['models'], 'ffmpeg': diagnostic['ffmpeg']['ok'],
            'ffprobe': diagnostic['ffprobe']['ok']}))
        sys.exit(0)
    directory = Path(sys.argv[1]).resolve()
    try:
        request = load_json(directory / 'request.json')
        if 'editedTranscript' in request:
            snapshot = directory / 'transcription-editee.json'
            write_json(snapshot, request['editedTranscript'])
            request['options']['transcript'] = str(snapshot)
        result = run(request['module'], request['paths'], request['options'], directory / 'outputs')
        write_json(directory / 'result.json', {'result': plain(result)})
        progress(100, 'Terminé')
    except Exception as error:
        write_json(directory / 'result.json', {'error': str(error)})
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)
