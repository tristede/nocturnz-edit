"""Two-person, local speaker assignment: reference voices or isolated microphones."""
import math
import hashlib
from pathlib import Path


MODEL_SHA256 = 'e9848563da86f263117134dfd7ad63c92355b37de492b55e325400c9d9c39012'

def validate_speaker_request(payload, samples=False):
    def number(value):
        if isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value) or not 0 <= value <= 86400:
            raise ValueError('Temps vocal invalide.')
        return float(value)

    def path(value):
        if not isinstance(value, str) or not Path(value).is_absolute():
            raise ValueError('Média local requis.')
        result = Path(value).resolve(strict=True)
        if not result.is_file() or result.suffix.lower() not in ('.wav','.mp3','.mp4','.mov','.m4a','.mxf','.aiff','.flac','.mkv'):
            raise ValueError('Média audio non pris en charge.')
        return str(result)

    mode = payload.get('mode')
    if mode not in ('mixed','mics'):
        raise ValueError('Choisis Piste mélangée ou Deux micros.')
    start, end = number(payload.get('start')), number(payload.get('end'))
    if not 0 < end - start <= 14400:
        raise ValueError('Choisis une plage de quatre heures maximum.')
    raw = payload.get('audio')
    if not isinstance(raw, list) or not 0 < len(raw) <= 1000:
        raise ValueError('Choisis les pistes audio contenant les voix.')
    audio = []
    for item in raw:
        if not isinstance(item, dict):
            raise ValueError('Clip audio invalide.')
        a,b,c = number(item.get('start')),number(item.get('end')),number(item.get('sourceIn'))
        speaker = item.get('speaker')
        if b <= a or c + b - a > 86400 or type(speaker) is not int or speaker not in (0,1):
            raise ValueError('Clip audio invalide.')
        audio.append(dict(path=path(item.get('path')),start=a,end=b,sourceIn=c,speaker=speaker))
    if len({item['path'] for item in audio}) > 20:
        raise ValueError('Choisis au maximum vingt sources audio par traitement.')
    if mode == 'mics' and {item['speaker'] for item in audio} != {0,1}:
        raise ValueError('Associe une piste micro différente à chaque intervenant.')
    references = []
    if mode == 'mixed' and not samples:
        raw = payload.get('references')
        if not isinstance(raw, list) or len(raw) != 2:
            raise ValueError('Repère une réplique de chaque intervenant.')
        for item in raw:
            if not isinstance(item,dict):
                raise ValueError('Référence vocale invalide.')
            a,b = number(item.get('start')),number(item.get('end'))
            if not 2 <= b-a <= 10:
                raise ValueError('Chaque référence doit contenir entre deux et dix secondes d’une voix seule.')
            references.append(dict(path=path(item.get('path')),start=a,end=b))
    return dict(module='speakersamples' if samples else 'speakerzoom', paths=list(dict.fromkeys(item['path'] for item in audio)),
        options=dict(mode=mode,audio=audio,references=references,start=start,end=end))



def embedding_model():
    import numpy as np
    import sherpa_onnx
    root=Path(__file__).resolve().parents[1]
    model=root/'.runtime/models/speakers/wespeaker_en_voxceleb_resnet34_LM.onnx'
    if not model.is_file() or hashlib.sha256(model.read_bytes()).hexdigest()!=MODEL_SHA256:
        raise ValueError('Installe le moteur vocal : npm run setup:speakers.')
    extractor=sherpa_onnx.SpeakerEmbeddingExtractor(sherpa_onnx.SpeakerEmbeddingExtractorConfig(
        model=str(model),num_threads=2,provider='cpu',debug=False))
    def embedding(samples):
        stream=extractor.create_stream()
        stream.accept_waveform(sample_rate=16000,waveform=np.ascontiguousarray(samples,dtype=np.float32))
        stream.input_finished()
        if not extractor.is_ready(stream):
            raise ValueError('Extrait trop court pour distinguer la voix.')
        vector=np.asarray(extractor.compute(stream),dtype=np.float32)
        return vector/max(float(np.linalg.norm(vector)),1e-9)
    return embedding


def suggest_references(options,progress):
    import numpy as np
    from faster_whisper.audio import decode_audio
    from faster_whisper.vad import get_speech_timestamps,VadOptions
    cache,voiced={},{}
    candidates=[]
    for item in options['audio']:
        path=item['path']
        if path not in cache:
            progress(5,'Recherche de répliques à écouter…')
            cache[path]=decode_audio(path,sampling_rate=16000)
            voiced[path]=get_speech_timestamps(cache[path],VadOptions(min_speech_duration_ms=200,
                min_silence_duration_ms=180,speech_pad_ms=100))
        source_left=item['sourceIn']+max(0,options['start']-item['start'])
        source_right=item['sourceIn']+min(item['end'],options['end'])-item['start']
        for span in voiced[path]:
            a=max(source_left,span['start']/16000)
            b=min(source_right,span['end']/16000)
            if b-a<2:
                continue
            count=min(256,max(1,int((b-a)/3)))
            for start in np.linspace(a,max(a,b-3),count):
                end=min(float(start)+3,b)
                candidates.append(dict(path=path,start=float(start),end=end,
                    timelineStart=item['start']+float(start)-item['sourceIn']))
    if len(candidates)<2:
        raise ValueError('Choisis une sélection plus longue avec une réplique de chaque personne.')
    candidates.sort(key=lambda item:item['timelineStart'])
    candidates=[candidates[int(i)] for i in np.linspace(0,len(candidates)-1,min(32,len(candidates)),dtype=int)]
    embed=embedding_model();vectors=[]
    for index,item in enumerate(candidates):
        vectors.append(embed(cache[item['path']][int(item['start']*16000):int(item['end']*16000)]))
        progress(10+int(80*(index+1)/len(candidates)),'Préparation des extraits des deux voix…')
    first,second=min(((a,b) for a in range(len(vectors)) for b in range(a+1,len(vectors))),
        key=lambda pair:float(vectors[pair[0]]@vectors[pair[1]]))
    alternatives=[i for i in range(len(candidates)) if i not in (first,second)]
    order=[first,second]+[alternatives[int(i)] for i in np.linspace(0,max(0,len(alternatives)-1),min(8,len(alternatives)),dtype=int)]
    return dict(samples=[candidates[i] for i in order])


def analyze_speakers(options, progress):
    import numpy as np
    from faster_whisper.audio import decode_audio
    from faster_whisper.vad import get_speech_timestamps, VadOptions
    cache, speech = {}, {}
    rate = 16000

    def load(path):
        if path not in cache:
            cache[path] = decode_audio(path, sampling_rate=rate)
        return cache[path]

    for index,path in enumerate(dict.fromkeys(item['path'] for item in options['audio'])):
        progress(5, 'Repérage de la parole…')
        speech[path] = [(item['start']/rate,item['end']/rate) for item in get_speech_timestamps(load(path),
            VadOptions(min_speech_duration_ms=150,min_silence_duration_ms=250,speech_pad_ms=80))]

    def window(item, a, b):
        left = max(a,item['start'])
        right = min(b,item['end'])
        if right <= left:
            return None
        start = item['sourceIn'] + left - item['start']
        end = start + right - left
        if not any(x < end and y > start for x,y in speech[item['path']]):
            return None
        samples = load(item['path'])[int(start*rate):int(end*rate)]
        return samples if len(samples) >= rate*.15 else None

    extractor, references = None, []
    if options['mode'] == 'mixed':
        embedding = embedding_model()
        for item in options['references']:
            samples = load(item['path'])[int(item['start']*rate):int(item['end']*rate)]
            spans = get_speech_timestamps(samples,VadOptions(min_silence_duration_ms=200,speech_pad_ms=0))
            voiced = np.concatenate([samples[s['start']:s['end']] for s in spans]) if spans else np.array([])
            if len(voiced) < rate:
                raise ValueError('Référence sans assez de parole : repère une réplique plus longue.')
            references.append(embedding(voiced))
        if float(references[0] @ references[1]) > .7:
            raise ValueError('Les deux références vocales sont trop proches. Repère deux répliques distinctes, sans chevauchement.')

    start,end = options['start'],options['end']
    step = .5
    total = math.ceil((end-start)/step)
    if total > 28800:
        raise ValueError('Plage trop longue.')
    cells = []
    # Normalize microphone gains, so a louder recording is not always selected.
    gains = {0:1.,1:1.}
    if options['mode'] == 'mics':
        for speaker in (0,1):
            energies=[]
            for item in options['audio']:
                if item['speaker'] != speaker:
                    continue
                for t in np.arange(max(start,item['start']),min(end,item['end']),1.):
                    samples=window(item,float(t),float(t)+.5)
                    if samples is not None:
                        energies.append(float(np.sqrt(np.mean(samples*samples))))
            gains[speaker] = max(float(np.percentile(energies,85)) if energies else 1.,1e-5)
    for index in range(total):
        a = start+index*step
        b = min(end,a+step)
        speaker,confidence = -1,0.
        if options['mode'] == 'mixed':
            candidates = [item for item in options['audio'] if item['start'] <= (a+b)/2 < item['end']]
            if len(candidates)>1:
                raise ValueError('Plusieurs clips audio se chevauchent sur la piste mélangée.')
            samples = window(candidates[0],max(start,a-.5),min(end,b+.5)) if candidates else None
            if samples is not None and len(samples)>=rate*.7:
                vector=embedding(samples)
                scores=[float(vector @ ref) for ref in references]
                winner=int(np.argmax(scores));margin=scores[winner]-scores[1-winner]
                if scores[winner]>=.3 and margin>=.08:
                    speaker,confidence=winner,min(1.,margin*3)
        else:
            scores=[0.,0.]
            for item in options['audio']:
                samples=window(item,a,b)
                if samples is not None:
                    scores[item['speaker']]=max(scores[item['speaker']],float(np.sqrt(np.mean(samples*samples)))/gains[item['speaker']])
            winner=int(np.argmax(scores))
            ratio=scores[winner]/max(scores[1-winner],1e-5)
            if scores[winner]>.06 and ratio>1.5:
                speaker,confidence=winner,min(1.,(ratio-1)/3)
        cells.append(dict(start=a,end=b,speaker=speaker,confidence=confidence))
        if index%10==0:
            progress(10+int(85*index/max(total,1)),'Identification des intervenants…')
    # Remove isolated half-second decisions; uncertain passages retain the wide shot.
    for i in range(1,len(cells)-1):
        if cells[i-1]['speaker']==cells[i+1]['speaker']!=cells[i]['speaker']:
            cells[i]['speaker']=cells[i-1]['speaker']
    turns=[]
    for cell in cells:
        if turns and turns[-1]['speaker']==cell['speaker']:
            turns[-1]['end']=cell['end']
        else:
            turns.append(dict(cell))
    if not any(turn['speaker'] in (0,1) for turn in turns):
        raise ValueError('Aucune prise de parole attribuée avec assez de confiance. Revois les répliques ou les pistes micros.')
    return dict(turns=turns,mode=options['mode'],unknownSeconds=sum(t['end']-t['start'] for t in turns if t['speaker']==-1))
