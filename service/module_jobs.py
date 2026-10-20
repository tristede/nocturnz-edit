"""Persistent, cancellable subprocess jobs for all imported tool adapters."""
from concurrent.futures import ThreadPoolExecutor
import copy
import json
import os
from pathlib import Path
import re
import signal
import subprocess
from threading import Event, Lock
import time
from uuid import uuid4
from .module_catalog import PYTHON, ROOT, validate
from .caption_transcript import clean_transcript

ACTIVE = ('queued', 'running', 'cancelling')
IMPORTABLE = {'.xml', '.srt', '.mp4', '.mov', '.wav', '.mp3', '.aiff', '.png'}


class ModuleJobs:
    def __init__(self, root):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.lock, self.records, self.cancels = Lock(), {}, {}
        self.pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix='nocturnz-modules')
        for file in self.root.glob('*/job.json'):
            try:
                record = json.loads(file.read_text())
                if record['status'] in ACTIVE:
                    record.update(status='failed', error='Service redémarré : relance le traitement.')
                self.records[record['id']] = record
            except (ValueError, KeyError, OSError):
                pass

    def save(self, record):
        directory = self.root / record['id']
        directory.mkdir(exist_ok=True)
        temporary = directory / 'job.tmp'
        temporary.write_text(json.dumps(record, ensure_ascii=False, allow_nan=False))
        temporary.replace(directory / 'job.json')

    def create(self, module, payload):
        request = validate(module, payload)
        return self._create(request)

    def _create(self, request):
        if not PYTHON.is_file():
            raise RuntimeError('Installe les modules : python3 scripts/install-modules.py.')
        with self.lock:
            if sum(r['status'] in ACTIVE for r in self.records.values()) >= 8:
                raise ValueError('La file contient déjà huit tâches.')
            key = uuid4().hex
            record = dict(id=key, module=request['module'], status='queued', progress=0, message='En attente',
                createdAt=time.time(), result=None, error=None, artifacts=[], request=request)
            self.records[key], self.cancels[key] = record, Event()
            self.save(record)
            (self.root / key / 'request.json').write_text(json.dumps(request))
        self.pool.submit(self.run, key)
        return self.get(key)

    def review(self, key, payload):
        record = self.get(key)
        if record['status'] != 'complete' or record['module'] not in ('hesitations', 'repetitions'):
            raise ValueError('Cette tâche ne contient pas de coupes à réviser.')
        accepted = payload.get('accepted')
        cuts = record['result'].get('cuts', [])
        if not isinstance(accepted, list) or len(accepted) > len(cuts) or len(set(accepted)) != len(accepted) or any(type(i) is not int or not 0 <= i < len(cuts) for i in accepted):
            raise ValueError('Sélection de coupes invalide.')
        return self._create({'module': 'reviewcuts', 'paths': record['request']['paths'], 'options': {'cuts': [cuts[i] for i in accepted]}})

    def captions(self, key, payload):
        record = self.get(key)
        if record['status'] != 'complete' or not record['request']['paths']:
            raise ValueError('Transcription requise.')
        if not any(Path(item['name']).name == 'transcription.json' for item in record['artifacts']):
            raise ValueError('Cette tâche ne contient pas de transcription.')
        draft = clean_transcript(payload.get('transcript'))
        options = {'style': payload.get('style', 'nocturnz'), 'format': payload.get('format', 'animated')}
        request = validate('captions', {'paths': record['request']['paths'][:1], 'options': options})
        request['editedTranscript'] = draft
        return self._create(request)

    def from_premiere_transcript(self, payload):
        request = validate('transcription', {'paths': payload.get('paths', []), 'options': {}})
        request['editedTranscript'] = clean_transcript(payload.get('transcript'), adobe=True)
        return self._create(request)

    def list(self):
        with self.lock:
            return [copy.deepcopy({key: value for key, value in record.items() if key != 'result'})
                for record in sorted(self.records.values(), key=lambda r: r.get('createdAt', 0), reverse=True)[:30]]

    def get(self, key):
        if not re.fullmatch('[0-9a-f]{32}', key):
            raise KeyError('Tâche inconnue.')
        with self.lock:
            return copy.deepcopy(self.records[key])

    def cancel(self, key):
        self.get(key)
        with self.lock:
            record = self.records[key]
            if record['status'] in ACTIVE:
                self.cancels[key].set()
                record['status'] = 'cancelling'
                self.save(record)
        return self.get(key)

    def run(self, key):
        directory = self.root / key
        process = None
        cancel = self.cancels[key]
        try:
            with self.lock:
                record = self.records[key]
                record['status'] = 'running'
                self.save(record)
            if cancel.is_set():
                raise InterruptedError('Traitement annulé.')
            with (directory / 'worker.log').open('w') as output, (directory / 'worker.err').open('w') as errors:
                process = subprocess.Popen([str(PYTHON), str(ROOT / 'service/module_worker.py'), str(directory)],
                    cwd=ROOT, stdout=output, stderr=errors, start_new_session=os.name != 'nt')
                started = time.monotonic()
                offset = 0
                while process.poll() is None:
                    if cancel.wait(0.25) or time.monotonic() - started > 6 * 3600:
                        if os.name != 'nt':
                            os.killpg(process.pid, signal.SIGTERM)
                        else:
                            process.terminate()
                        try:
                            process.wait(timeout=5)
                        except subprocess.TimeoutExpired:
                            if os.name != 'nt':
                                os.killpg(process.pid, signal.SIGKILL)
                            else:
                                process.kill()
                            process.wait()
                        raise InterruptedError('Traitement annulé.')
                    with (directory / 'worker.log').open() as log:
                        log.seek(offset)
                        lines = log.readlines()
                        offset = log.tell()
                    for line in lines[-20:]:
                        try:
                            data = json.loads(line)
                            if 'progress' in data:
                                with self.lock:
                                    record.update(progress=data['progress'], message=data.get('message', ''))
                                    self.save(record)
                        except (ValueError, TypeError):
                            pass
            data = json.loads((directory / 'result.json').read_text()) if (directory / 'result.json').is_file() else {}
            if cancel.is_set():
                raise InterruptedError('Traitement annulé.')
            if process.returncode or 'error' in data:
                raise RuntimeError(data.get('error') or 'Le moteur a quitté sans résultat. Consulte worker.err dans le dossier de tâche.')
            artifacts = []
            for path in sorted((directory / 'outputs').rglob('*')):
                if path.is_file() and path.suffix.lower() in IMPORTABLE | {'.json', '.txt', '.vtt', '.ass'}:
                    artifacts.append(dict(id=len(artifacts), name=str(path.relative_to(directory / 'outputs')),
                        path=str(path), bytes=path.stat().st_size, importable=path.suffix.lower() in IMPORTABLE))
            with self.lock:
                failed = data.get('result', {}).get('failed', 0) if isinstance(data.get('result'), dict) else 0
                record.update(status='complete', progress=100, message=f'Terminé · {failed} échec(s)' if failed else 'Terminé', result=data.get('result'), artifacts=artifacts)
                self.save(record)
        except Exception as error:
            with self.lock:
                record.update(status='cancelled' if isinstance(error, InterruptedError) else 'failed', error=str(error))
                self.save(record)

    def artifact(self, key, index):
        record = self.get(key)
        if record['status'] != 'complete':
            raise ValueError('Traitement non terminé.')
        artifact = record['artifacts'][int(index)]
        path = Path(artifact['path']).resolve(strict=True)
        if not path.is_relative_to((self.root / key).resolve()):
            raise ValueError('Résultat hors du dossier de tâche.')
        if path.suffix.lower() not in ('.json', '.txt', '.srt', '.vtt', '.ass', '.xml') or path.stat().st_size > 4 * 1024 * 1024:
            raise ValueError('Ce résultat se récupère via son chemin local ou Importer.')
        return dict(name=path.name, text=path.read_text(encoding='utf-8-sig'))

    def close(self):
        for cancel in self.cancels.values():
            cancel.set()
        self.pool.shutdown(wait=True, cancel_futures=True)
