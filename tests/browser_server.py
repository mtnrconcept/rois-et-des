"""Loopback static server with deterministic module MIME types on every OS.

Only this test handler changes MIME lookup; Windows registry and system settings
are untouched. Binding port zero atomically also avoids free-port probe races.
"""

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread


class _AssetHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".mjs": "application/javascript",
        ".js": "application/javascript",
        ".wasm": "application/wasm",
        ".glb": "model/gltf-binary",
    }

    def log_message(self, format, *args):
        pass


class BrowserServer:
    def __init__(self, root):
        handler = partial(_AssetHandler, directory=str(root.resolve()))
        self._server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        self._thread = Thread(target=self._server.serve_forever, daemon=True)
        self.base_url = f"http://127.0.0.1:{self._server.server_port}"
        self._thread.start()

    def close(self):
        self._server.shutdown()
        self._server.server_close()
        self._thread.join(timeout=5)
