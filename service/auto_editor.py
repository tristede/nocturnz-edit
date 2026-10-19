"""Adapter for the official auto-editor 29.3.1 CLI (Unlicense).

No upstream code is copied here. Analysis and XML generation run upstream's CLI.
All source times are frame indices with an exact rational timebase.
"""
from fractions import Fraction
import json
import math
import os
from pathlib import Path
import subprocess
import time
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
VERSION = '29.3.1'
TICKS = 254016000000
MEDIA_EXTENSIONS = {'.wav', '.mp3', '.mp4', '.mov', '.m4a', '.mkv', '.aiff', '.aif', '.flac', '.aac', '.webm', '.mxf'}


def binary_path():
    return Path(os.environ.get('NOCTURNZ_AUTO_EDITOR', str(ROOT / '.runtime' / 'bin' / ('auto-editor.exe' if os.name == 'nt' else 'auto-editor')))).resolve()


def engine_info():
    path = binary_path()
    if not path.is_file():
        return {'name': 'auto-editor', 'available': False, 'version': None}
    try:
        result = subprocess.run([str(path), '--version'], capture_output=True, text=True, timeout=5)
        version = result.stdout.strip()
        return {'name': 'auto-editor', 'available': result.returncode == 0 and version == VERSION, 'version': version}
    except (OSError, subprocess.SubprocessError):
        return {'name': 'auto-editor', 'available': False, 'version': None}


def numeric(value, name, low, high):
    if isinstance(value, bool):
        raise ValueError(f'{name} invalide.')
    number = float(value)
    if not math.isfinite(number) or not low <= number <= high:
        raise ValueError(f'{name} doit être entre {low} et {high}.')
    return number


def validate_request(data):
    source = Path(data.get('path', '')).expanduser()
    if not source.is_absolute() or not source.is_file() or source.suffix.lower() not in MEDIA_EXTENSIONS:
        raise ValueError('Choisis un fichier audio ou vidéo local existant.')
    source = source.resolve()
    rate = Fraction(str(data.get('frameRate', '25/1')))
    if not 1 <= rate <= 240:
        raise ValueError('Cadence invalide.')
    stream = str(data.get('stream', 'all'))
    if stream != 'all' and (not stream.isdigit() or int(stream) > 63):
        raise ValueError('Piste audio invalide.')
    result = {
        'path': str(source), 'frameRate': str(rate), 'stream': stream,
        'thresholdDb': numeric(data.get('thresholdDb', -35), 'Seuil', -90, 0),
        'minSilenceMs': numeric(data.get('minSilenceMs', 400), 'Silence minimum', 40, 60000),
        'beforeMs': numeric(data.get('beforeMs', 120), 'Marge avant', 0, 5000),
        'afterMs': numeric(data.get('afterMs', 120), 'Marge après', 0, 5000),
        'sourceInTicks': str(max(0, int(data.get('sourceInTicks', '0')))),
        'sourceOutTicks': str(int(data['sourceOutTicks'])) if data.get('sourceOutTicks') is not None else None,
        'sequenceStartTicks': str(max(0, int(data.get('sequenceStartTicks', '0')))),
    }
    if result['sourceOutTicks'] is not None and int(result['sourceOutTicks']) <= int(result['sourceInTicks']):
        raise ValueError('Bornes source invalides.')
    return result


def run_engine(arguments, directory, cancel=None):
    if cancel and cancel.is_set():
        raise InterruptedError('Analyse annulée.')
    if not binary_path().is_file():
        raise RuntimeError('Moteur absent : lance python3 scripts/install-engine.py.')
    log_path = Path(directory) / 'engine.log'
    with log_path.open('wb') as log:
        process = subprocess.Popen([str(binary_path()), *map(str, arguments)], stdout=log, stderr=log, cwd=ROOT)
        started = time.monotonic()
        try:
            while process.poll() is None:
                if cancel and cancel.is_set():
                    raise InterruptedError('Analyse annulée.')
                if time.monotonic() - started > 7200:
                    raise TimeoutError('Délai du moteur dépassé.')
                time.sleep(.1)
            if process.returncode:
                message = log_path.read_text(errors='replace')[-2000:]
                raise RuntimeError(f'auto-editor : {message.strip()}')
        finally:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()


def parse_proposals(timeline, options):
    if timeline.get('version') != '2' or not isinstance(timeline.get('clips'), list):
        raise ValueError('Format auto-editor non pris en charge.')
    rate = Fraction(timeline['tb'])
    if rate != Fraction(options['frameRate']):
        raise ValueError('La cadence du moteur ne correspond pas à la demande.')
    clips = timeline['clips']
    if not clips:
        raise ValueError('Aucune durée audio analysable.')
    effects = timeline['effects']
    total = max(int(clip[1]) for clip in clips)
    start = math.ceil(Fraction(int(options['sourceInTicks']), TICKS) * rate)
    stop = total if options['sourceOutTicks'] is None else min(total, math.floor(Fraction(int(options['sourceOutTicks']), TICKS) * rate))
    if stop <= start:
        raise ValueError('La plage source est hors du média.')
    pad_after = math.ceil(Fraction(str(options['afterMs'])) * rate / 1000)
    pad_before = math.ceil(Fraction(str(options['beforeMs'])) * rate / 1000)
    minimum = Fraction(str(options['minSilenceMs'])) * rate / 1000
    sequence_start = int(options['sequenceStartTicks'])
    source_in = int(options['sourceInTicks'])
    def ticks(frame):
        exact = Fraction(frame * TICKS, 1) / rate
        if exact.denominator != 1:
            raise ValueError('Cadence non représentable exactement en ticks Premiere.')
        return exact.numerator
    proposals = []
    for left, right, effect in clips:
        if effects[effect] != 'cut':
            continue
        left, right = max(start, int(left)), min(stop, int(right))
        if right - left < minimum:
            continue
        # Preserve handles adjacent to speech, including audio outside a trimmed selection.
        cut_start = left + (pad_after if left > 0 else 0)
        cut_end = right - (pad_before if right < total else 0)
        if cut_end <= cut_start:
            continue
        a, b = ticks(cut_start), ticks(cut_end)
        proposals.append({
            'id': f'cut-{len(proposals)+1}', 'status': 'proposed',
            'startFrame': cut_start, 'endFrame': cut_end,
            'sourceRange': {'startTicks': str(a), 'endTicks': str(b)},
            'sequenceRange': {'startTicks': str(sequence_start + a-source_in), 'endTicks': str(sequence_start + b-source_in)},
            'durationSeconds': float(Fraction(cut_end-cut_start, 1) / rate),
        })
    return {
        'schemaVersion': 1, 'kind': 'silence-source-plan', 'engine': {'name': 'auto-editor', 'version': VERSION},
        'source': options['path'], 'frameRate': str(rate), 'sourceStartFrame': start,
        'sourceEndFrame': stop, 'totalFrames': total, 'operations': proposals,
        'durationSeconds': float(Fraction(stop-start, 1) / rate),
    }


def analyze(options, directory, cancel=None):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    output = directory / 'analysis.v2'
    run_engine([
        options['path'], '--edit', f"audio:threshold={options['thresholdDb']:g}dB,stream={options['stream']}",
        '--margin', '0', '--export', 'v2', '--frame-rate', options['frameRate'],
        '--no-open', '--quiet', '--output', output,
    ], directory, cancel)
    return parse_proposals(json.loads(output.read_text()), options)


def reviewed_timeline(plan, accepted_ids):
    if not isinstance(accepted_ids, list) or len(accepted_ids) != len(set(accepted_ids)):
        raise ValueError('Liste de coupes invalide.')
    operations = {op['id']: op for op in plan['operations']}
    if any(item not in operations for item in accepted_ids):
        raise ValueError('Une coupe est inconnue.')
    cuts = sorted((operations[item]['startFrame'], operations[item]['endFrame']) for item in accepted_ids)
    start, stop, total = plan['sourceStartFrame'], plan['sourceEndFrame'], plan['totalFrames']
    chunks, cursor = [], 0
    def add(a, b, effect):
        if b > a:
            chunks.append([a, b, effect])
    add(0, start, 0)
    cursor = start
    for left, right in cuts:
        if left < cursor or right > stop or right <= left:
            raise ValueError('Coupes superposées ou hors plage source.')
        add(cursor, left, 1)
        add(left, right, 0)
        cursor = right
    add(cursor, stop, 1)
    add(stop, total, 0)
    if not any(effect == 1 for _, _, effect in chunks):
        raise ValueError('La sélection retirerait tout le média.')
    return {'version': '2', 'source': plan['source'], 'tb': plan['frameRate'], 'effects': ['cut', 'nil'], 'clips': chunks}


def export_premiere(plan, accepted_ids, directory):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    timeline = reviewed_timeline(plan, accepted_ids)
    reviewed = directory / 'reviewed.v2'
    reviewed.write_text(json.dumps(timeline, indent=2))
    output = directory / 'Nocturnz_Silences.xml'
    run_engine([reviewed, '--export', 'premiere', '--no-open', '--quiet', '--output', output], directory)
    root = ET.parse(output).getroot()
    if root.tag != 'xmeml' or root.find('.//sequence') is None:
        raise RuntimeError('Le moteur n’a pas produit un XML Premiere valide.')
    return str(output.resolve())
