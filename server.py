#!/usr/bin/env python3
"""
Tiny server for ebpf_papers — serves static files and handles
POST /api/save to persist papers.json to disk.

Admin access is gated by ADMIN_TOKEN from .env.
"""

import json
import os
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

# --------------- Load .env ---------------
ENV_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
PAPERS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "papers.json")

def load_env(path):
    """Minimal .env loader — reads KEY=VALUE lines."""
    env = {}
    if not os.path.exists(path):
        return env
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, _, value = line.partition("=")
                env[key.strip()] = value.strip()
    return env

_env = load_env(ENV_FILE)
ADMIN_TOKEN = _env.get("ADMIN_TOKEN", "")

if not ADMIN_TOKEN:
    print("WARNING: No ADMIN_TOKEN set in .env — write access is OPEN to everyone!")
else:
    print(f"Admin token loaded ({len(ADMIN_TOKEN)} chars)")


# --------------- Request handler ---------------

class PapersHandler(SimpleHTTPRequestHandler):

    def do_GET(self):
        parsed = urlparse(self.path)

        # GET /api/admin-check?token=xxx  →  lets the frontend verify the token
        if parsed.path == "/api/admin-check":
            return self._handle_admin_check(parsed)

        # Everything else: static files
        super().do_GET()

    def do_POST(self):
        if urlparse(self.path).path == "/api/save":
            return self._handle_save()
        self.send_error(404, "Not Found")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors_headers()
        self.end_headers()

    # ---------- /api/admin-check ----------

    def _handle_admin_check(self, parsed):
        """Return {"admin": true/false} so the frontend knows whether to show edit UI."""
        params = parse_qs(parsed.query)
        token = params.get("token", [""])[0]
        is_admin = bool(ADMIN_TOKEN and token == ADMIN_TOKEN)

        self.send_response(200)
        self._cors_headers()
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(json.dumps({"admin": is_admin}).encode())

    # ---------- /api/save ----------

    def _handle_save(self):
        # ---- Enforce admin token ----
        token = self._extract_token()
        if ADMIN_TOKEN and token != ADMIN_TOKEN:
            self.send_response(403)
            self._cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({
                "ok": False,
                "error": "Forbidden — invalid or missing admin token"
            }).encode())
            return

        try:
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            data = json.loads(body)

            if not isinstance(data, list):
                raise ValueError("Expected a JSON array")

            with open(PAPERS_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
                f.write("\n")

            self.send_response(200)
            self._cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": True, "count": len(data)}).encode())
        except Exception as e:
            self.send_response(400)
            self._cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": False, "error": str(e)}).encode())

    def _extract_token(self):
        """Get admin token from X-Admin-Token header or ?token= query param."""
        # Check header first
        header_token = self.headers.get("X-Admin-Token", "")
        if header_token:
            return header_token
        # Fall back to query param
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        return params.get("token", [""])[0]

    def _cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Admin-Token")

    def end_headers(self):
        if hasattr(self, "path") and self.path.endswith("papers.json"):
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

    def log_message(self, format, *args):
        # Cleaner log: show method + path only
        msg = format % args
        sys.stderr.write(f"[{self.log_date_time_string()}] {msg}\n")


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    server = HTTPServer(("0.0.0.0", port), PapersHandler)
    print(f"Serving on http://0.0.0.0:{port}")
    print(f"Papers file: {PAPERS_FILE}")
    if ADMIN_TOKEN:
        print(f"\n  Admin URL:  http://localhost:{port}?admin={ADMIN_TOKEN}")
        print(f"  Public URL: http://localhost:{port}\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
