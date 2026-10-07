import argparse, json, mimetypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from backend import queries
from backend.database.db import connect, seed

ROOT=Path(__file__).resolve().parents[1]; FRONT=ROOT/'frontend'
class Handler(BaseHTTPRequestHandler):
    def send_json(self, data, code=200):
        raw=json.dumps(data,ensure_ascii=False).encode(); self.send_response(code); self.send_header('Content-Type','application/json; charset=utf-8'); self.send_header('Content-Length',str(len(raw))); self.end_headers(); self.wfile.write(raw)
    def do_GET(self):
        parsed = urlparse(self.path); path = parsed.path
        if path.startswith('/api/'):
            name = path[len('/api/'):]
            conn = connect()
            try:
                if name == 'events':
                    scope = parse_qs(parsed.query).get('scope', [None])[0]
                    self.send_json(queries.events(conn, scope if scope in queries.SCOPES else None))
                    return
                if name in queries.DATASETS:
                    self.send_json(queries.dataset(conn, name))
                    return
            finally:
                conn.close()

        file = FRONT / 'index.html' if path == '/' else FRONT / path.lstrip('/')
        if file.is_file():
            raw = file.read_bytes()
            mime = 'application/javascript' if file.suffix == '.js' else (mimetypes.guess_type(str(file))[0] or 'text/plain')
            self.send_response(200)
            self.send_header('Content-Type', mime)
            self.send_header('Content-Length', str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)
        else:
            self.send_json({'error': 'not found'}, 404)

def run():
    conn = connect()
    seed(conn)
    conn.close()
    server = ThreadingHTTPServer(('127.0.0.1', 8000), Handler)
    print("Server running on http://127.0.0.1:8000")
    server.serve_forever()
if __name__=='__main__':
    ap=argparse.ArgumentParser(); ap.add_argument('--seed',action='store_true'); ap.parse_args(); run()
