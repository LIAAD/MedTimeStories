"""Annotate clinical reports with Gemini and write INCEpTION files.

    export GEMINI_API_KEY=...                      
    python annotate.py data/lma_005.txt            # -> output/lma_005.json
    python annotate.py data/ --out output --xmi    # every .txt of a folder, also as .xmi

One .txt file = one patient (one or more consecutive reports).
"""
import argparse
import logging
import sys
from pathlib import Path

from medtime import Gemini, annotate_file


def main():
    parser = argparse.ArgumentParser(description="Med2Story annotation with Gemini -> INCEpTION (UIMA CAS JSON)")
    parser.add_argument("input", help="a .txt file or a folder of .txt files")
    parser.add_argument("--out", default="output", help="output folder (default: output)")
    parser.add_argument("--xmi", action="store_true", help="also write UIMA CAS XMI + TypeSystem.xml")
    parser.add_argument("--cache", default=None,
                        help="file to store Gemini's answers in; the same text is then annotated again for free")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    source = Path(args.input)
    files = sorted(source.glob("*.txt")) if source.is_dir() else [source]
    if not files:
        sys.exit(f"no .txt file found in {source}")

    gemini = Gemini(cache_file=args.cache)
    formats = ("json", "xmi") if args.xmi else ("json",)
    for path in files:
        for written in annotate_file(path, gemini, args.out, formats):
            print("written:", written)
    print("Gemini requests:", gemini.stats)


if __name__ == "__main__":
    main()
