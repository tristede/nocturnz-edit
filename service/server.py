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


def health_payload():
    engine = engine_info()
    return {
        'name': 'Nocturnz Edit Local Service', 'version': '0.2.0', 'status': 'ready',
        'capabilities': ['silence-analysis', 'silence-review', 'premiere-xml-export'] if engine['available'] else [],
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
            elif re.fullmatch(r'/api/v1/jobs/[0-9a-f]{32}', self.path):
                self.reply(200, self.server.jobs.get(self.path.rsplit('/', 1)[1]))
            else:
                self.reply(404, {'error': 'Route inconnue.'})
        except KeyError:
            self.reply(404, {'error': 'Tâche inconnue.'})

    def do_POST(self):
        if not self.allowed(private=True):
            return
        try:
            if self.headers.get_content_type() != 'application/json':
                raise ValueError('JSON requis.')
            length = int(self.headers.get('Content-Length', '0'))
            if length <= 0 or length > 1024 * 1024:
                raise ValueError('Taille de requête invalide.')
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError('Objet JSON requis.')
            if self.path == '/api/v1/silences/analyze':
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
    return server


if __name__ == '__main__':
    server = make_server()
    print('Nocturnz Edit : http://127.0.0.1:8765', flush=True)
    print(json.dumps(health_payload(), ensure_ascii=False), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.jobs.close()
        server.server_close()
