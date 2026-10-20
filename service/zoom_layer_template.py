"""Materialize our clean native adjustment-layer project, never a user's project."""
import gzip
from pathlib import Path
from uuid import UUID, uuid5, uuid4
import xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[1]
NAMESPACE=UUID('4ac71225-22a8-4b09-a789-9b68acf59e55')


def prepare(payload):
    width,height=payload.get('width'),payload.get('height')
    if any(type(value) is not int or not 64<=value<=16384 for value in (width,height)):
        raise ValueError('Dimensions du calque invalides.')
    raw=payload.get('timebase')
    if not isinstance(raw,str) or not raw.isdigit() or not 1000000000<=int(raw)<=254016000000:
        raise ValueError('Cadence du calque invalide.')
    timebase=int(raw);identity=f'v1-{width}x{height}-{timebase}'
    name=f'Nocturnz · Calque auto {width}×{height} · {timebase}'
    tree=ET.parse(ROOT/'plugin/assets/adjustment-layer.xml');root=tree.getroot()
    sequence=root.find('Sequence')
    if sequence is None or len(root.findall('Sequence'))!=1 or root.find('MasterClip/IsAdjustmentLayer') is None:
        raise RuntimeError('Modèle de calque natif invalide.')
    mapping={element.attrib['ObjectUID']:str(uuid5(NAMESPACE,identity+element.attrib['ObjectUID'])) for element in root if 'ObjectUID' in element.attrib}
    text=ET.tostring(root,encoding='unicode')
    for original,replacement in mapping.items():text=text.replace(original,replacement)
    root=ET.fromstring(text);sequence=root.find('Sequence');sequence.find('Name').text=name
    duration=(5*254016000000//timebase)*timebase
    for element in root.iter():
        if element.tag=='FrameRect' and element.text=='0,0,3840,2160':element.text=f'0,0,{width},{height}'
        elif element.tag=='MZ.Sequence.PreviewFrameSizeWidth':element.text=str(width)
        elif element.tag=='MZ.Sequence.PreviewFrameSizeHeight':element.text=str(height)
        elif element.tag in ('FrameRate','MediaFrameRate') and element.text=='10160640000':element.text=str(timebase)
        elif element.tag in ('End','OutPoint','OriginalDuration','MZ.WorkOutPoint','Monitor.ProgramZoomOut') and element.text=='1270080000000':element.text=str(duration)
    # The sole timeline clip's native adjustment media starts at one hour by
    # default; use a zero-based reusable template, aligned to the new timebase.
    for clip in root.findall('VideoClip'):
        if clip.findtext('AdjustmentLayer')=='true':
            clip.find('Clip/InPoint').text='0';clip.find('Clip/OutPoint').text=str(duration)
    folder=ROOT/'.runtime/zoom-layer-templates';folder.mkdir(parents=True,exist_ok=True)
    destination=folder/(identity+'.prproj')
    data=ET.tostring(root,encoding='utf-8',xml_declaration=True)
    if not destination.is_file():
        temporary=folder/(identity+'.'+uuid4().hex+'.tmp')
        temporary.write_bytes(gzip.compress(data,mtime=0));temporary.replace(destination)
    return dict(path=str(destination),sequenceId=sequence.attrib['ObjectUID'],name=name)
