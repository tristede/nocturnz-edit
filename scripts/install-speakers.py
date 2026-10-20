#!/usr/bin/env python3
"""Install local speaker identification, without reading media or recording a mic."""
import hashlib
import json
from pathlib import Path
import ssl
import subprocess
import sys
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
PYTHON = ROOT / '.runtime/modules-venv' / ('Scripts/python.exe' if sys.platform == 'win32' else 'bin/python')
NAME = 'wespeaker_en_voxceleb_resnet34_LM.onnx'
URL = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/' + NAME
SHA256 = 'e9848563da86f263117134dfd7ad63c92355b37de492b55e325400c9d9c39012'


def main():
    if not PYTHON.is_file():
        raise SystemExit('Installe d’abord les modules : npm run setup:modules.')
    if '--inside' not in sys.argv:
        subprocess.run([str(PYTHON),str(Path(__file__).resolve()),'--inside'],check=True)
        return
    import certifi
    subprocess.run([str(PYTHON),'-m','pip','install','-r',str(ROOT/'requirements-speakers.txt')],check=True)
    folder = ROOT / '.runtime/models/speakers'
    folder.mkdir(parents=True,exist_ok=True)
    target = folder / NAME
    if not target.is_file() or hashlib.sha256(target.read_bytes()).hexdigest() != SHA256:
        with urllib.request.urlopen(URL,context=ssl.create_default_context(cafile=certifi.where()),timeout=120) as response:
            data=response.read(30*1024*1024)
        if hashlib.sha256(data).hexdigest()!=SHA256:
            raise RuntimeError('Empreinte du modèle vocal inattendue. Installation interrompue.')
        temporary=target.with_suffix('.download')
        temporary.write_bytes(data)
        temporary.replace(target)
    (folder/'provenance.json').write_text(json.dumps(dict(url=URL,sha256=SHA256,model=NAME,
        license='CC-BY-4.0',source='https://huggingface.co/Wespeaker/wespeaker-voxceleb-resnet34-LM',
        runtime='sherpa-onnx 1.13.8'),indent=2))
    print('Moteur des deux intervenants installé. Aucun média lu, aucun microphone enregistré.')


if __name__ == '__main__':
    main()
