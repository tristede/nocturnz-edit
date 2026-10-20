"""Interchange outputs always create new source sequences, never edit a project."""
from pathlib import Path
from xml.etree import ElementTree as ET


def ranges_xml(source, ranges, target):
    from opencut.core.silence import TimeSegment
    from opencut.export.premiere import export_premiere_xml
    from opencut.utils.config import ExportConfig
    if not ranges:
        raise ValueError('Aucun extrait à exporter.')
    return export_premiere_xml(source, [TimeSegment(float(r['start']), float(r['end'])) for r in ranges], str(target),
        config=ExportConfig(sequence_name='Nocturnz — Extraits'))


def podcast_xml(paths, cuts, target):
    from opencut.utils.media import probe
    infos = [probe(path) for path in paths]
    if not cuts or any(not info.video for info in infos):
        raise ValueError('Le montage podcast demande des sources vidéo et des prises de parole détectées.')
    rate = infos[0].video.fps
    if any(abs(info.video.fps - rate) > 0.001 for info in infos):
        raise ValueError('Synchronise les cadences des caméras avant cet export podcast.')
    total = min(info.duration for info in infos)
    frames = round(total * rate)

    def add(parent, tag, value):
        ET.SubElement(parent, tag).text = str(value)

    def add_rate(parent):
        entry = ET.SubElement(parent, 'rate')
        add(entry, 'timebase', infos[0].video.effective_timebase)
        add(entry, 'ntsc', str(infos[0].video.ntsc).upper())

    def characteristics(parent, info):
        entry = ET.SubElement(parent, 'samplecharacteristics')
        add_rate(entry)
        add(entry, 'width', info.video.width)
        add(entry, 'height', info.video.height)
        add(entry, 'pixelaspectratio', 'square')
        add(entry, 'anamorphic', 'FALSE')
        add(entry, 'fielddominance', 'none')

    written = set()

    def clip(track, camera, start, end, suffix, audio=False):
        start, end = max(0, round(start * rate)), min(frames, round(end * rate))
        if end <= start:
            return
        info = infos[camera]
        item = ET.SubElement(track, 'clipitem', id=f'clip-{camera}-{suffix}')
        for key, value in [('name', Path(paths[camera]).name), ('duration', round(info.duration * rate)),
                           ('start', start), ('end', end), ('in', start), ('out', end), ('enabled', 'TRUE')]:
            add(item, key, value)
        add_rate(item)
        file = ET.SubElement(item, 'file', id=f'camera-{camera}')
        if camera not in written:
            written.add(camera)
            add(file, 'name', Path(paths[camera]).name)
            add(file, 'pathurl', Path(paths[camera]).as_uri())
            add(file, 'duration', round(info.duration * rate))
            add_rate(file)
            media = ET.SubElement(file, 'media')
            characteristics(ET.SubElement(media, 'video'), info)
            if info.audio:
                sound = ET.SubElement(media, 'audio')
                add(sound, 'channelcount', info.audio.channels)
                sample = ET.SubElement(sound, 'samplecharacteristics')
                add(sample, 'samplerate', info.audio.sample_rate)
                add(sample, 'depth', 16)
        if audio:
            st = ET.SubElement(item, 'sourcetrack')
            add(st, 'mediatype', 'audio')
            add(st, 'trackindex', 1)

    root = ET.Element('xmeml', version='4')
    sequence = ET.SubElement(root, 'sequence', id='nocturnz-podcast')
    add(sequence, 'name', 'Nocturnz — Podcast source')
    add(sequence, 'duration', frames)
    add_rate(sequence)
    media = ET.SubElement(sequence, 'media')
    video = ET.SubElement(media, 'video')
    characteristics(ET.SubElement(video, 'format'), infos[0])
    track = ET.SubElement(video, 'track')
    for index, cut in enumerate(cuts):
        camera = int(cut['track'])
        if not 0 <= camera < len(paths):
            raise ValueError('Caméra inconnue dans les prises de parole.')
        clip(track, camera, float(cut['time']), float(cut['time']) + float(cut['duration']), index)
    audio = ET.SubElement(media, 'audio')
    for index, info in enumerate(infos):
        if info.audio:
            clip(ET.SubElement(audio, 'track'), index, 0, total, 'audio', audio=True)
    ET.indent(root)
    ET.ElementTree(root).write(target, encoding='utf-8', xml_declaration=True)
    return str(target)
