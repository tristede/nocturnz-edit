"""Read occurrence labels from a saved .prproj, never write a Premiere file.

The object graph paths were identified from Pouf/py-premiere (MIT), commit
38e72ef5d389f472183fb23c471f9c9eb79394f8. See third_party/py-premiere.LICENSE.
This narrow reader does not import or execute that library.
"""
import gzip
import hashlib
import io
from pathlib import Path
import re
import zlib
from decimal import Decimal, InvalidOperation
from xml.etree import ElementTree as ET

MAX_COMPRESSED = 64 * 1024 * 1024
MAX_XML = 192 * 1024 * 1024
MAX_CLIPS = 20000


def _guid(value):
    if not isinstance(value, str):
        raise ValueError('Identifiant de séquence requis.')
    text = value.strip().strip('{}').lower()
    if not re.fullmatch(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}', text):
        raise ValueError('Identifiant de séquence invalide.')
    return text


def _integer(text, default=None):
    if text is None and default is not None:
        return default
    if not isinstance(text, str) or not re.fullmatch(r'-?\d{1,20}', text.strip()):
        raise ValueError('Entier manquant ou invalide dans le projet.')
    return int(text)


def read_timeline_labels(payload):
    raw_path = payload.get('path')
    if not isinstance(raw_path, str) or not Path(raw_path).is_absolute():
        raise ValueError('Chemin absolu du projet requis.')
    path = Path(raw_path).resolve(strict=True)
    if path.suffix.lower() != '.prproj' or not path.is_file():
        raise ValueError('Choisis un projet Premiere .prproj enregistré.')
    if path.stat().st_size > MAX_COMPRESSED:
        raise ValueError('Projet trop volumineux pour cette lecture (64 Mio maximum).')
    with path.open('rb') as handle:
        raw = handle.read(MAX_COMPRESSED + 1)
    if len(raw) > MAX_COMPRESSED:
        raise ValueError('Projet trop volumineux.')
    try:
        if raw.startswith(b'\x1f\x8b'):
            with gzip.GzipFile(fileobj=io.BytesIO(raw)) as handle:
                xml = handle.read(MAX_XML + 1)
        else:
            xml = raw
    except (OSError, EOFError, zlib.error) as error:
        raise ValueError('Projet compressé illisible ou incomplet.') from error
    if len(xml) > MAX_XML:
        raise ValueError('Projet décompressé trop volumineux (192 Mio maximum).')
    # Reject alternate encodings and DTDs before parsing a user-chosen file.
    if b'\x00' in xml or any(marker in xml.upper() for marker in (b'<!DOCTYPE', b'<!ENTITY')):
        raise ValueError('Encodage, DTD ou entités XML non pris en charge.')
    try:
        root = ET.fromstring(xml)
    except ET.ParseError as error:
        raise ValueError('Le projet ne contient pas un XML Premiere lisible.') from error
    if root.tag != 'PremiereData':
        raise ValueError('Format de projet Premiere non reconnu.')
    by_id, by_uid = {}, {}
    for element in root:
        for attribute, target in [('ObjectID', by_id), ('ObjectUID', by_uid)]:
            key = element.get(attribute)
            if key is not None:
                if key in target:
                    raise ValueError('Identifiants ambigus dans le projet.')
                target[key] = element

    def resolve(ref):
        if ref is None:
            raise ValueError('Référence manquante dans le projet.')
        if ref.get('ObjectRef') in by_id:
            return by_id[ref.get('ObjectRef')]
        if ref.get('ObjectURef') in by_uid:
            return by_uid[ref.get('ObjectURef')]
        raise ValueError('Référence de projet inconnue.')

    sequence_id = _guid(payload.get('sequenceId'))
    sequences = [element for element in root if element.tag == 'Sequence' and element.get('ObjectUID') and
                 _guid(element.get('ObjectUID')) == sequence_id]
    if len(sequences) != 1:
        raise ValueError('Séquence active absente du projet enregistré. Enregistre puis relis les libellés.')
    sequence = sequences[0]
    clips, labels, tracks = [], {}, []
    timebase, frame_size = None, None
    for pair in sequence.findall('TrackGroups/TrackGroup'):
        group = resolve(pair.find('Second'))
        if group.tag != 'VideoTrackGroup':
            continue
        if timebase is not None:
            raise ValueError('Plusieurs groupes vidéo non pris en charge.')
        timebase = _integer(group.findtext('TrackGroup/FrameRate'))
        if timebase <= 0:
            raise ValueError('Cadence de séquence invalide.')
        rect = (group.findtext('FrameRect') or '').split(',')
        if len(rect) == 4:
            frame_size = {'width': _integer(rect[2]), 'height': _integer(rect[3])}
        for track_ref in group.findall('TrackGroup/Tracks/Track'):
            track = resolve(track_ref)
            index = _integer(track.findtext('ClipTrack/Track/Index'), 0)
            if index < 0 or any(item['index'] == index for item in tracks):
                raise ValueError('Index de piste invalide ou ambigu.')
            locked = track.findtext('ClipTrack/Track/IsLocked') == 'true'
            muted = track.findtext('ClipTrack/Track/IsMuted') == 'true'
            tracks.append({'index': index, 'locked': locked, 'muted': muted})
            for ref in track.findall('ClipTrack/ClipItems/TrackItems/TrackItem'):
                if len(clips) >= MAX_CLIPS:
                    raise ValueError('Trop de clips dans cette séquence (20 000 maximum).')
                item = resolve(ref)
                core = item.find('ClipTrackItem')
                if core is None:
                    continue
                subclip = resolve(core.find('SubClip'))
                holder = resolve(subclip.find('Clip'))
                clip = holder.find('Clip')
                if clip is None:
                    continue
                bag = clip.find('Node/Properties')
                raw_label = None if bag is None else bag.findtext('asl.clip.label.name')
                raw_color = None if bag is None else bag.findtext('asl.clip.label.color')
                label = None
                # Never fall back to MasterClip/ProjectItem labels.
                if raw_label is not None or raw_color is not None:
                    match = re.fullmatch(r'BE\.Prefs\.LabelColors\.(\d{1,2})', raw_label or '')
                    label_index = int(match[1]) if match and int(match[1]) < 16 else None
                    color = _integer(raw_color) if raw_color is not None else None
                    key = f'{raw_label or "unnamed"}|{color}'
                    label = {'key': key, 'index': label_index, 'storedName': (raw_label or '')[:120],
                             'packedColor': color, 'clipCount': 0}
                    labels.setdefault(key, label)['clipCount'] += 1
                    if len(labels) > 256:
                        raise ValueError('Trop de variantes de libellés dans cette séquence.')
                source = resolve(clip.find('Source'))
                media_ref = source.find('MediaSource/Media')
                media = resolve(media_ref) if media_ref is not None else None
                media_path = None if media is None else media.findtext('FilePath')
                start = _integer(core.findtext('TrackItem/Start'), 0)
                end = _integer(core.findtext('TrackItem/End'))
                source_in = _integer(clip.findtext('InPoint'), 0)
                source_out = _integer(clip.findtext('OutPoint'), 0)
                speed = clip.findtext('PlaybackSpeed') or '1'
                try:
                    unit_speed = len(speed) < 64 and Decimal(speed) == Decimal(1)
                except InvalidOperation:
                    unit_speed = False
                supported = (media_path is not None and not media_path.isdigit() and
                             unit_speed and source_out - source_in == end - start and
                             end > start and source_in >= 0 and start >= 0 and not locked and not muted)
                reason = None
                if locked:
                    reason = 'piste verrouillée dans le projet enregistré'
                elif muted:
                    reason = 'piste masquée dans le projet enregistré'
                elif media_path is None or media_path.isdigit():
                    reason = 'clip composé ou média généré'
                elif not supported:
                    reason = 'vitesse ou bornes source non prises en charge'
                clips.append({'id': item.findtext('ID') or item.get('ObjectID'),
                              'name': (subclip.findtext('Name') or '')[:500], 'trackIndex': index,
                              'startTicks': str(start), 'endTicks': str(end),
                              'sourceInTicks': str(source_in), 'sourceOutTicks': str(source_out),
                              'mediaPath': media_path, 'labelKey': None if label is None else label['key'],
                              'supported': supported, 'unsupportedReason': reason})
    if timebase is None or frame_size is None:
        raise ValueError('Séquence vidéo ou dimensions non reconnues.')
    return {'schemaVersion': 1, 'source': 'saved-prproj-occurrence-labels',
            'projectPath': str(path), 'projectName': path.name,
            'projectSha256': hashlib.sha256(raw).hexdigest(), 'sequenceId': sequence_id,
            'sequenceName': sequence.findtext('Name') or '', 'timebase': str(timebase),
            'frameSize': frame_size, 'tracks': tracks, 'labels': list(labels.values()), 'clips': clips}
