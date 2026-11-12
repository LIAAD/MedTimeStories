"""Tiny HTTP API so the demo can annotate a pasted report.

    export GEMINI_API_KEY=...
    python server.py [--port 8000] [--cache answers.jsonl]

POST /api/annotate       {"text": "...", "name": "optional id"}  ->  202 {"id": job}   (annotation runs in the background)
GET  /api/annotate/<id>  ->  {"status": "running"} | {"status": "error", "error": ...}
                             | {"status": "done", "result": <INCEpTION CAS JSON>}
"""
import argparse
import json
import logging
import re
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from medtime import Gemini, annotate_text, to_inception_json

MAX_CHARS = 30000
JOB_TTL = 3600   # seconds a finished job is kept
log = logging.getLogger("medtime.server")
gemini = None
gemini_lock = threading.Lock()
jobs = {}
jobs_lock = threading.Lock()


def get_gemini(cache_file):
    global gemini
    with gemini_lock:
        if gemini is None:
            gemini = Gemini(cache_file=cache_file)
        return gemini


def make_handler(cache_file):
    class Handler(BaseHTTPRequestHandler):
        def _send(self, status, body, content_type="application/json"):
            data = body.encode("utf-8")
            try:
                self.send_response(status)
                self.send_header("Content-Type", content_type + "; charset=utf-8")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            except (BrokenPipeError, ConnectionResetError):
                pass  # the client went away

        def _error(self, status, message):
            self._send(status, json.dumps({"error": message}))

        def do_GET(self):
            if self.path == "/api/health":
                return self._send(200, json.dumps({"ok": True}))
            prefix = "/api/annotate/"
            if not self.path.startswith(prefix):
                return self._error(404, "not found")
            with jobs_lock:
                job = jobs.get(self.path[len(prefix):])
                job = dict(job) if job else None
            if job is None:
                return self._error(404, "unknown job")
            if job["status"] == "done":
                # the CAS JSON is already a string, so it is embedded as it is
                return self._send(200, '{"status": "done", "result": ' + job["result"] + "}")
            self._send(200, json.dumps({"status": job["status"], "error": job.get("error")}))

        def do_POST(self):
            if self.path != "/api/annotate":
                return self._error(404, "not found")
            try:
                length = int(self.headers.get("Content-Length", 0))
                payload = json.loads(self.rfile.read(length) or b"{}")
                text = payload.get("text", "")
            except (ValueError, AttributeError):
                return self._error(400, "invalid JSON body")
            if not isinstance(text, str) or not text.strip():
                return self._error(400, "'text' is empty")
            if len(text) > MAX_CHARS:
                return self._error(413, f"text too long (max {MAX_CHARS} characters)")
            name = re.sub(r"[^A-Za-z0-9_-]+", "-", str(payload.get("name") or "live")).strip("-") or "live"
            job_id = uuid.uuid4().hex
            with jobs_lock:
                for old in [k for k, j in jobs.items() if time.time() - j["created"] > JOB_TTL]:
                    del jobs[old]
                jobs[job_id] = {"status": "running", "created": time.time()}
            threading.Thread(target=run_job, args=(job_id, text, name, cache_file), daemon=True).start()
            self._send(202, json.dumps({"id": job_id}))

    return Handler


def run_job(job_id, text, name, cache_file):
    try:
        doc = annotate_text(text, name, get_gemini(cache_file))
        result = {"status": "done", "result": to_inception_json(doc)}
    except Exception as exc:  # report any pipeline failure to the demo
        log.exception("annotation failed")
        result = {"status": "error", "error": str(exc)}
    with jobs_lock:
        jobs[job_id].update(result)


def main():
    parser = argparse.ArgumentParser(description="Annotation API for the MedTimeStories demo")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--cache", default=None, help="file to store Gemini's answers in")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    get_gemini(args.cache)  # fail early if the API key is missing
    print(f"listening on http://{args.host}:{args.port}")
    ThreadingHTTPServer((args.host, args.port), make_handler(args.cache)).serve_forever()


if __name__ == "__main__":
    main()
