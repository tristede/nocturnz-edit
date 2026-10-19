"""Persistent job records, one media process at a time, cancellation and restart reporting."""
from concurrent.futures import ThreadPoolExecutor
import copy
import json
from pathlib import Path
import re
from threading import Event, Lock
from uuid import uuid4
from .auto_editor import analyze, export_premiere, validate_request


class Jobs:
    def __init__(self, root):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.records, self.cancels = {}, {}
        self.lock = Lock()
        self.pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix='nocturnz-media')
        for file in self.root.glob('*/job.json'):
            try:
                record = json.loads(file.read_text())
                if record['status'] in ('queued', 'running', 'cancelling'):
                    record.update(status='failed', error='Service redémarré : relance l’analyse.')
                self.records[record['id']] = record
            except (ValueError, KeyError):
                pass

    def _save(self, record):
        directory = self.root / record['id']
        directory.mkdir(exist_ok=True)
        temporary = directory / 'job.tmp'
        temporary.write_text(json.dumps(record, ensure_ascii=False, indent=2))
        temporary.replace(directory / 'job.json')

    def create(self, payload):
        options = validate_request(payload)
        with self.lock:
            if sum(r['status'] in ('queued', 'running', 'cancelling') for r in self.records.values()) >= 8:
                raise ValueError('La file de tâches est pleine.')
            job_id = uuid4().hex
            record = {'id': job_id, 'status': 'queued', 'options': options, 'result': None, 'error': None}
            self.records[job_id] = record
            self.cancels[job_id] = Event()
            self._save(record)
        self.pool.submit(self._run, job_id)
        return self.get(job_id)

    def _run(self, job_id):
        with self.lock:
            record = self.records[job_id]
            cancel = self.cancels[job_id]
            record['status'] = 'running'
            self._save(record)
        try:
            if cancel.is_set():
                raise InterruptedError('Analyse annulée.')
            result = analyze(record['options'], self.root / job_id, cancel)
            with self.lock:
                if cancel.is_set():
                    raise InterruptedError('Analyse annulée.')
                record.update(status='complete', result=result)
                self._save(record)
        except Exception as error:
            with self.lock:
                record.update(status='cancelled' if isinstance(error, InterruptedError) else 'failed', error=str(error))
                self._save(record)

    def get(self, job_id):
        if not re.fullmatch(r'[0-9a-f]{32}', job_id):
            raise KeyError('Tâche inconnue.')
        with self.lock:
            if job_id not in self.records:
                raise KeyError('Tâche inconnue.')
            return copy.deepcopy(self.records[job_id])

    def cancel(self, job_id):
        self.get(job_id)
        with self.lock:
            record = self.records[job_id]
            if record['status'] in ('queued', 'running', 'cancelling'):
                self.cancels[job_id].set()
                record['status'] = 'cancelling'
                self._save(record)
        return self.get(job_id)

    def export(self, job_id, accepted_ids):
        record = self.get(job_id)
        if record['status'] != 'complete':
            raise ValueError('L’analyse n’est pas terminée.')
        # Each revision gets its own output: no overwrite of a previous export.
        directory = self.root / job_id / ('export-' + uuid4().hex)
        path = export_premiere(record['result'], accepted_ids, directory)
        return {'path': path, 'accepted': len(accepted_ids), 'scope': 'source-only'}

    def close(self):
        for event in self.cancels.values():
            event.set()
        self.pool.shutdown(wait=True, cancel_futures=True)
