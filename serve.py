#!/usr/bin/env python3
"""Tiny dev server.   python serve.py            -> http://localhost:8000
                      python serve.py --fetch    -> first download three.js into vendor/ (works offline afterwards)"""
import http.server, socketserver, sys, os, urllib.request
ROOT = os.path.dirname(os.path.abspath(__file__)); os.chdir(ROOT)
if "--fetch" in sys.argv:
    os.makedirs("vendor", exist_ok=True)
    urllib.request.urlretrieve("https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js", "vendor/three.min.js")
    print("saved vendor/three.min.js")
PORT = int(os.environ.get("PORT", 8000))
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        path = self.path.split("?", 1)[0]
        if path == "/" or path.endswith(".html"):
            self.send_header("Cache-Control", "no-cache")
        else:
            self.send_header("Cache-Control", "public, max-age=60, must-revalidate")
        super().end_headers()

class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

with Server(("", PORT), H) as s:
    print(f"Serving on http://localhost:{PORT}  (Ctrl+C to stop)"); s.serve_forever()
