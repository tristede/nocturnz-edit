"""Small on-demand previews for the visual zoom editor; no project writes."""
import json
import math
from pathlib import Path
import subprocess
import sys
import time
from uuid import uuid4

ROOT=Path(__file__).resolve().parents[1]
MEDIA=ROOT/'.runtime/zoom-previews'
PYTHON=ROOT/'.runtime/modules-venv'/('Scripts/python.exe' if sys.platform=='win32' else 'bin/python')
EXTENSIONS={'.mp4','.mov','.mxf','.mkv','.wav','.mp3','.m4a','.aiff','.flac','.webm'}


def validate(payload):
    raw=payload.get('path')
    if not isinstance(raw,str) or not Path(raw).is_absolute():
        raise ValueError('Choisis un média local.')
    path=Path(raw).resolve(strict=True)
    if not path.is_file() or path.suffix.lower() not in EXTENSIONS:
        raise ValueError('Format de média non pris en charge.')
    moment=payload.get('time',0)
    if isinstance(moment,bool) or not isinstance(moment,(int,float)) or not math.isfinite(moment) or not 0<=moment<=86400:
        raise ValueError('Position d’aperçu invalide.')
    return path,float(moment)


def prepare(payload,kind):
    path,moment=validate(payload)
    if not PYTHON.is_file():
        raise RuntimeError('Installe le moteur média local pour afficher les aperçus.')
    MEDIA.mkdir(parents=True,exist_ok=True)
    # Only disposable preview assets are cleaned, never imported project media.
    for file in MEDIA.iterdir():
        if file.is_file() and time.time()-file.stat().st_mtime>86400:
            file.unlink(missing_ok=True)
    key=uuid4().hex
    request=MEDIA/(key+'.request.json')
    request.write_text(json.dumps(dict(payload,path=str(path),time=moment,kind=kind,key=key)))
    try:
        result=subprocess.run([str(PYTHON),str(Path(__file__).resolve()),str(request)],
            capture_output=True,text=True,timeout=40)
        if result.returncode:
            raise RuntimeError(result.stderr[-800:] or 'Aperçu indisponible.')
        return json.loads(result.stdout)
    except subprocess.TimeoutExpired as error:
        raise RuntimeError('Ce média met trop de temps à répondre. Choisis une autre image.') from error
    finally:
        request.unlink(missing_ok=True)


def worker(request):
    import base64
    from io import BytesIO
    from PIL import Image
    path=request['path'];moment=request['time']
    executable=ROOT/'.runtime/toolchain/bin'/('ffmpeg.exe' if sys.platform=='win32' else 'ffmpeg')
    probe=executable.with_name('ffprobe.exe' if sys.platform=='win32' else 'ffprobe')
    if request['kind']=='listen':
        duration=request.get('duration',3)
        if isinstance(duration,bool) or not isinstance(duration,(int,float)) or not math.isfinite(duration) or not 2<=duration<=10:
            raise ValueError('Extrait audio invalide.')
        target=MEDIA/(request['key']+'.mp4')
        arguments=[str(executable),'-v','error','-nostdin','-f','lavfi','-i','color=c=0x100d17:s=64x36:r=10',
            '-ss',str(moment),'-i',path,'-t',str(duration),'-map','0:v:0','-map','1:a:0',
            '-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-b:a','96k',
            '-ar','24000','-ac','1','-shortest','-movflags','+faststart','-y',str(target)]
        process=subprocess.run(arguments,capture_output=True,timeout=25)
        if process.returncode or not target.is_file():
            target.unlink(missing_ok=True)
            raise ValueError('Cet extrait audio ne peut pas être lu.')
        return dict(media='/api/v1/zooms/media/'+target.name,duration=duration)
    size=request.get('size')
    if not isinstance(size,dict) or any(type(size.get(key)) not in (int,float) or not math.isfinite(size[key]) or not 64<=size[key]<=16384 for key in ('width','height')):
        raise ValueError('Dimensions de séquence invalides.')
    metadata=subprocess.run([str(probe),'-v','error','-select_streams','v:0','-show_entries',
        'stream=width,height,sample_aspect_ratio:stream_side_data=rotation','-of','json',path],capture_output=True,text=True,timeout=10)
    streams=json.loads(metadata.stdout).get('streams',[])
    if not streams:
        raise ValueError('Aucune image vidéo disponible.')
    stream=streams[0];width,height=stream['width'],stream['height']
    if stream.get('sample_aspect_ratio') not in (None,'1:1','0:1','N/A'):
        raise ValueError('L’aperçu demande une vidéo à pixels carrés.')
    rotation=next((item.get('rotation',0) for item in stream.get('side_data_list',[]) if 'rotation' in item),0)
    if abs(rotation)%180==90:
        width,height=height,width
    process=subprocess.run([str(executable),'-v','error','-nostdin','-ss',str(moment),'-i',path,
        '-frames:v','1','-vf',"scale=w='min(1920,iw)':h=-2",'-f','image2pipe','-c:v','mjpeg','pipe:1'],capture_output=True,timeout=20)
    if process.returncode or not process.stdout:
        raise ValueError('Cette image du rush ne peut pas être extraite.')
    image=Image.open(BytesIO(process.stdout)).convert('RGB')
    frame=request.get('frame')
    if frame is None:
        frame=dict(scale=100*min(size['width']/width,size['height']/height),position=dict(x=.5,y=.5),
            anchor=dict(x=.5,y=.5),rotation=0,frameSize=size)
    numbers=[frame.get('scale'),frame.get('rotation'),frame.get('position',{}).get('x'),frame.get('position',{}).get('y'),frame.get('anchor',{}).get('x'),frame.get('anchor',{}).get('y')]
    if any(type(value) not in (int,float) or not math.isfinite(value) or abs(value)>1000000 for value in numbers) or not 0<frame['scale']<=10000:
        raise ValueError('Cadrage d’aperçu invalide.')
    ratio=min(960/size['width'],960/size['height'],1)
    canvas=(max(1,round(size['width']*ratio)),max(1,round(size['height']*ratio)))
    scale=frame['scale']/100;angle=math.radians(frame['rotation']);c,s=math.cos(angle),math.sin(angle)
    dx,dy=image.width/width,image.height/height
    px,py=frame['position']['x']*size['width'],frame['position']['y']*size['height']
    transform=(dx*c/(scale*ratio),dx*s/(scale*ratio),dx*(frame['anchor']['x']*width-(c*px+s*py)/scale),
        -dy*s/(scale*ratio),dy*c/(scale*ratio),dy*(frame['anchor']['y']*height-(-s*px+c*py)/scale))
    preview=image.transform(canvas,Image.Transform.AFFINE,transform,Image.Resampling.BICUBIC,fillcolor=(0,0,0))
    buffer=BytesIO();preview.save(buffer,format='JPEG',quality=85)
    return dict(image='data:image/jpeg;base64,'+base64.b64encode(buffer.getvalue()).decode(),frame=frame,width=canvas[0],height=canvas[1])


if __name__=='__main__':
    try:
        print(json.dumps(worker(json.loads(Path(sys.argv[1]).read_text()))))
    except Exception as error:
        print(str(error),file=sys.stderr);sys.exit(1)
