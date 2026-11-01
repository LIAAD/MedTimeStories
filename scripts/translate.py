"""Create English translations of report texts and event surfaces.

Usage:
    pip install deep-translator
    python scripts/translate.py inception/converted/converted-dataset.json --out inception/translations.json

WARNING: deep-translator sends the text to an online translation service (Google Translate
by default). Only run this on data that is de-identified and approved for external services.

Output format (read by `convert-inception.mjs --translations`):
    {"reports": {"<sha256 of report text>": "English text"}, "surfaces": {"registo": "record"}}

Existing entries are kept, so re-running only translates new or changed texts.
"""

import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

# Per-request character limits of each provider (kept below the real limit).
PROVIDERS = {"google": 4500, "mymemory": 450}


def chunk_text(text: str, limit: int = PROVIDERS["google"]) -> list[str]:
    """Split on line breaks (and spaces for very long lines) into pieces below `limit`, keeping the breaks."""
    chunks: list[str] = []
    current = ""
    for line in text.splitlines(keepends=True):
        while len(line) > limit:
            cut = line.rfind(" ", 0, limit)
            cut = cut + 1 if cut > 0 else limit
            if current:
                chunks.append(current)
                current = ""
            chunks.append(line[:cut])
            line = line[cut:]
        if len(current) + len(line) > limit:
            chunks.append(current)
            current = ""
        current += line
    if current:
        chunks.append(current)
    return chunks


def make_translate(source: str, provider: str):
    try:
        from deep_translator import GoogleTranslator, MyMemoryTranslator
        from deep_translator.exceptions import TooManyRequests
    except ImportError:
        sys.exit("Missing dependency. Install it with: pip install deep-translator")
    if provider == "mymemory":
        # MyMemory needs regional codes, e.g. pt-PT -> en-US.
        translator = MyMemoryTranslator(source="pt-PT" if source == "pt" else source, target="en-US")
    else:
        translator = GoogleTranslator(source=source, target="en")
    limit = PROVIDERS[provider]

    def call(text: str) -> str:
        # Google throttles bursts; pause between calls and back off when it still refuses.
        for attempt in range(8):
            try:
                time.sleep(0.5)
                return translator.translate(text)
            except TooManyRequests:
                wait = 15 * (attempt + 1)
                print(f"  rate limited, waiting {wait}s...", flush=True)
                time.sleep(wait)
        sys.exit("Still rate limited. Re-run later; finished translations are kept.")

    def translate(text: str) -> str:
        parts = []
        for chunk in chunk_text(text, limit):
            stripped = chunk.strip()
            if not stripped:
                parts.append(chunk)
                continue
            leading = chunk[: len(chunk) - len(chunk.lstrip())]
            trailing = chunk[len(chunk.rstrip()) :]
            parts.append(leading + (call(stripped) or stripped) + trailing)
        return "".join(parts)

    return translate


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("dataset", type=Path, help="Converted dataset JSON ({\"patients\": [...]})")
    parser.add_argument("--out", type=Path, default=Path("inception/translations.json"))
    parser.add_argument("--source", default="pt", help="Source language code (default: pt)")
    parser.add_argument("--provider", choices=sorted(PROVIDERS), default="google", help="Translation service (default: google)")
    parser.add_argument("--report-id", action="append", help="Only translate this report and its events (repeatable); useful for testing")
    args = parser.parse_args()

    data = json.loads(args.dataset.read_text(encoding="utf-8"))
    patients = data["patients"] if isinstance(data, dict) else data
    reports = [r for p in patients for r in p["reports"]]
    if args.report_id:
        reports = [r for r in reports if r["id"] in args.report_id]
        if not reports:
            sys.exit(f"No report matches {args.report_id}")

    result = {"reports": {}, "surfaces": {}}
    if args.out.exists():
        result.update(json.loads(args.out.read_text(encoding="utf-8")))

    def save() -> None:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    translate = make_translate(args.source, args.provider)

    todo_reports = {}
    for report in reports:
        key = hashlib.sha256(report["text"].encode("utf-8")).hexdigest()
        if report["text"].strip() and key not in result["reports"]:
            todo_reports[key] = report["text"]
    surfaces = {e["surface"] for r in reports for e in r["events"]}
    # Dates and numbers need no translation, and a translator may reorder day/month.
    todo_surfaces = sorted(s for s in surfaces - set(result["surfaces"]) if any(c.isalpha() for c in s))

    print(f"Translating {len(todo_reports)} report(s) and {len(todo_surfaces)} event surface(s)...")
    for i, (key, text) in enumerate(todo_reports.items(), 1):
        result["reports"][key] = translate(text)
        save()
        print(f"  report {i}/{len(todo_reports)}")
    for i, surface in enumerate(todo_surfaces, 1):
        result["surfaces"][surface] = translate(surface)
        if i % 25 == 0 or i == len(todo_surfaces):
            save()
            print(f"  surface {i}/{len(todo_surfaces)}")
    save()
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
