"""Generate only a synthetic PNG and FCP7 XML; never open or write a .prproj."""
from pathlib import Path
import struct
import zlib
from xml.etree import ElementTree as ET

root = Path(__file__).resolve().parents[1]
directory = root / '.runtime/validation/zoom-labels'
directory.mkdir(parents=True, exist_ok=True)
image = directory / 'nocturnz-grid.png'
width, height = 1920, 1080
colors = [(57, 36, 93), (33, 74, 87), (100, 46, 59)]
pixels = bytearray()
for y in range(height):
    pixels.append(0)
    for x in range(width):
        pixels.extend((225, 225, 235) if x % 160 < 3 or y % 135 < 3 else colors[min(x // 640, 2)])


def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))


image.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
                  + chunk(b'IDAT', zlib.compress(pixels)) + chunk(b'IEND', b''))


def add(parent, name, text):
    ET.SubElement(parent, name).text = str(text)


def rate(parent):
    value = ET.SubElement(parent, 'rate')
    add(value, 'timebase', 25)
    add(value, 'ntsc', 'FALSE')


def characteristics(parent):
    value = ET.SubElement(parent, 'samplecharacteristics')
    rate(value)
    for name, text in [('width', width), ('height', height), ('anamorphic', 'FALSE'),
                       ('pixelaspectratio', 'square'), ('fielddominance', 'none')]:
        add(value, name, text)


xml = ET.Element('xmeml', version='4')
sequence = ET.SubElement(xml, 'sequence', id='nocturnz-labels')
add(sequence, 'name', 'Nocturnz — Validation Zooms')
add(sequence, 'duration', 300)
rate(sequence)
add(sequence, 'in', -1)
add(sequence, 'out', -1)
video = ET.SubElement(ET.SubElement(sequence, 'media'), 'video')
characteristics(ET.SubElement(video, 'format'))
track = ET.SubElement(video, 'track')
for index, label in enumerate(('Rose', 'Mango', 'Rose')):
    clip = ET.SubElement(track, 'clipitem', id=f'clip-{index}')
    for name, text in [('name', image.name), ('duration', 300), ('enabled', 'TRUE'),
                       ('start', index*100), ('end', (index+1)*100),
                       ('in', index*100), ('out', (index+1)*100), ('alphatype', 'straight')]:
        add(clip, name, text)
    rate(clip)
    source = ET.SubElement(clip, 'file', id='grid-source')
    if index == 0:
        add(source, 'name', image.name)
        add(source, 'pathurl', image.as_uri())
        add(source, 'duration', 300)
        rate(source)
        add(source, 'stillframe', 'TRUE')
        characteristics(ET.SubElement(ET.SubElement(source, 'media'), 'video'))
    add(ET.SubElement(clip, 'labels'), 'label2', label)
add(track, 'enabled', 'TRUE')
add(track, 'locked', 'FALSE')
ET.indent(xml)
visible = root / 'validation-local'
visible.mkdir(exist_ok=True)
for target in (directory / 'validation.xml', visible / 'validation.xml'):
    ET.ElementTree(xml).write(target, encoding='utf-8', xml_declaration=True)
print(visible / 'validation.xml')
