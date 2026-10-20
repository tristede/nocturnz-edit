#!/usr/bin/env python3
"""Loopback-only media service. Source media never leave this machine."""
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
import sys

if __package__ in (None, ''):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from service.auto_editor import ROOT, engine_info
from service.jobs import Jobs
from service.timeline_labels import read_timeline_labels
from service.module_catalog import catalog
from service.module_jobs import ModuleJobs
from service.clipboard_image import paste_image


def health_payload():
    engine = engine_info()
    return {
        'name': 'Nocturnz/Edit Local Service', 'version': '0.5.0', 'status': 'ready',
        'capabilities': ['saved-timeline-labels', 'caption-editor-render', 'premiere-source-transcript'] + (['clipboard-image'] if sys.platform == 'darwin' and (ROOT / '.runtime/bin/nocturnz-clipboard').is_file() else []) + (['silence-analysis', 'silence-review', 'premiere-xml-export'] if engine['available'] else []),
        'mediaProcessing': engine['available'], 'engines': [engine],
    }


class Handler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(15)

    def reply(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(body)

    def allowed(self, private=False):
        port = self.server.server_address[1]
        host = self.headers.get('Host', '')
        origin = self.headers.get('Origin')
        if host not in (f'127.0.0.1:{port}', f'localhost:{port}'):
            self.reply(403, {'error': 'Hôte refusé.'})
            return False
        # No wildcard CORS: web pages cannot read media/job paths or trigger jobs.
        if origin not in (None, 'uxp://xyz.nocturnz.edit'):
            self.reply(403, {'error': 'Origine refusée.'})
            return False
        if private and self.headers.get('X-Nocturnz-Client') != 'premiere-panel':
            self.reply(403, {'error': 'Client refusé.'})
            return False
        return True

    def do_GET(self):
        if not self.allowed(private=self.path not in ('/health', '/api/v1/capabilities')):
            return
        try:
            if self.path in ('/health', '/api/v1/capabilities'):
                self.reply(200, health_payload())
            elif self.path == '/api/v1/modules':
                self.reply(200, catalog())
            elif self.path == '/api/v1/module-jobs':
                self.reply(200, {'jobs': self.server.module_jobs.list()})
            elif re.fullmatch(r'/api/v1/module-jobs/[0-9a-f]{32}', self.path):
                self.reply(200, self.server.module_jobs.get(self.path.rsplit('/', 1)[1]))
            elif re.fullmatch(r'/api/v1/module-jobs/[0-9a-f]{32}/artifacts/\d+', self.path):
                parts = self.path.split('/')
                self.reply(200, self.server.module_jobs.artifact(parts[4], parts[6]))
            elif re.fullmatch(r'/api/v1/jobs/[0-9a-f]{32}', self.path):
                self.reply(200, self.server.jobs.get(self.path.rsplit('/', 1)[1]))
            else:
                self.reply(404, {'error': 'Route inconnue.'})
        except KeyError:
            self.reply(404, {'error': 'Tâche inconnue.'})
        except (ValueError, OSError, IndexError) as error:
            self.reply(400, {'error': str(error)})

    def do_POST(self):
        if not self.allowed(private=True):
            return
        try:
            if self.headers.get_content_type() != 'application/json':
                raise ValueError('JSON requis.')
            length = int(self.headers.get('Content-Length', '0'))
            caption_route = self.path == '/api/v1/captions/from-premiere' or self.path.endswith('/captions')
            if length <= 0 or length > (8 if caption_route else 1) * 1024 * 1024:
                raise ValueError('Taille de requête invalide.')
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError('Objet JSON requis.')
            if self.path == '/api/v1/captions/from-premiere':
                self.reply(202, self.server.module_jobs.from_premiere_transcript(payload))
            elif self.path == '/api/v1/clipboard/image':
                self.reply(201, paste_image())
            elif self.path == '/api/v1/zooms/labels/read':
                self.reply(200, read_timeline_labels(payload))
            elif re.fullmatch(r'/api/v1/modules/[a-z]+/run', self.path):
                self.reply(202, self.server.module_jobs.create(self.path.split('/')[4], payload))
            elif re.fullmatch(r'/api/v1/module-jobs/[0-9a-f]{32}/cancel', self.path):
                self.reply(200, self.server.module_jobs.cancel(self.path.split('/')[4]))
            elif re.fullmatch(r'/api/v1/module-jobs/[0-9a-f]{32}/review', self.path):
                self.reply(202, self.server.module_jobs.review(self.path.split('/')[4], payload))
            elif re.fullmatch(r'/api/v1/module-jobs/[0-9a-f]{32}/captions', self.path):
                self.reply(202, self.server.module_jobs.captions(self.path.split('/')[4], payload))
            elif self.path == '/api/v1/silences/analyze':
                if not engine_info()['available']:
                    self.reply(503, {'error': 'Moteur absent : lance python3 scripts/install-engine.py.'})
                    return
                self.reply(202, self.server.jobs.create(payload))
            elif re.fullmatch(r'/api/v1/jobs/[0-9a-f]{32}/cancel', self.path):
                self.reply(200, self.server.jobs.cancel(self.path.split('/')[4]))
            elif re.fullmatch(r'/api/v1/jobs/[0-9a-f]{32}/export', self.path):
                result = self.server.jobs.export(self.path.split('/')[4], payload.get('acceptedIds'))
                result['xml'] = Path(result['path']).read_text()
                self.reply(200, result)
            else:
                self.reply(404, {'error': 'Route inconnue.'})
        except KeyError:
            self.reply(404, {'error': 'Tâche inconnue.'})
        except (ValueError, TypeError, OverflowError, ZeroDivisionError) as error:
            self.reply(400, {'error': str(error)})
        except (OSError, RuntimeError) as error:
            self.reply(500, {'error': str(error)})

    def log_message(self, _format, *_args):
        return


def make_server(port=8765, job_root=None):
    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    server.daemon_threads = True
    server.jobs = Jobs(job_root or ROOT / '.runtime' / 'jobs')
    server.module_jobs = ModuleJobs(Path(job_root) / 'modules' if job_root else ROOT / '.runtime/module-jobs')
    return server


if __name__ == '__main__':
    server = make_server()
    print('Nocturnz/Edit : http://127.0.0.1:8765', flush=True)
    print(json.dumps(health_payload(), ensure_ascii=False), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.jobs.close()
        server.module_jobs.close()
        server.server_close()
