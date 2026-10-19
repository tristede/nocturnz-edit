#!/usr/bin/env python3
"""Minimal local capability endpoint; media processing is intentionally not claimed yet."""

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def health_payload():
    return {
        "name": "Nocturnz Edit Local Service",
        "version": "0.1.0",
        "status": "ready",
        "capabilities": [],
        "mediaProcessing": False,
    }


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path not in ("/health", "/api/v1/capabilities"):
            self.send_error(404)
            return
        body = json.dumps(health_payload()).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, _format, *_args):
        return


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 8765), Handler)
    print("Nocturnz Edit local service listening on http://127.0.0.1:8765")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
