"""Shared fixtures: serve the site from the repo root and give tests a Chromium browser (SwiftShader WebGL)."""
import os, threading, http.server, socketserver, functools
import pytest
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

class _Quiet(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.mjs': 'text/javascript', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm'}
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store'); super().end_headers()

@pytest.fixture(scope='session')
def site():
    socketserver.TCPServer.allow_reuse_address = True
    srv = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(_Quiet, directory=ROOT))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield f'http://127.0.0.1:{srv.server_address[1]}'
    srv.shutdown()

@pytest.fixture(scope='session')
def browser():
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        yield b
        b.close()

def open_page(browser, url, width=1280, height=800, js=True, **ctx):
    """Open url in a fresh context; returns (page, errors) where errors collects console errors and page errors."""
    c = browser.new_context(viewport={'width': width, 'height': height}, java_script_enabled=js, **ctx)
    pg = c.new_page()
    errors = []
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto(url, wait_until='load')
    return pg, errors
