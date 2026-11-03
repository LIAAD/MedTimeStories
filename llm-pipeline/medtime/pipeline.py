"""The whole annotator: input text -> 4 layers with Gemini -> INCEpTION document.

    from medtime import Gemini, annotate_text, to_inception_json

    gemini = Gemini()                                   # API key from the environment variable GEMINI_API_KEY
    doc = annotate_text(report_text, "lma_005", gemini)
    cas_json = to_inception_json(doc)                   # string, same format as an INCEpTION export
"""
import logging
import time
from pathlib import Path

from . import inception, step1_detection, step2_classification, step3_attributes, step4_links
from .document import load_document

log = logging.getLogger("medtime")

LAYERS = [("1 detection", step1_detection.run), ("2 classification", step2_classification.run),
          ("3 attributes", step3_attributes.run), ("4 links", step4_links.run)]

# helper fields that are only needed while annotating
INTERNAL_KEYS = ["categories", "linked_pairs"]


def annotate_text(text, doc_id, gemini):
    """Annotate one patient text (one or more reports). Returns the document dict (see document.py)."""
    doc = load_document(text, doc_id)
    for name, run_layer in LAYERS:
        started = time.time()
        run_layer(doc, gemini)
        log.info("%s | layer %-16s | %3d events %3d temporal expressions %3d tlinks | %.0f s", doc_id, name,
                 len(doc["events"]), len(doc["timexes"]), len(doc["tlinks"]), time.time() - started)
    for key in INTERNAL_KEYS:
        doc.pop(key, None)
    return doc


def annotate_file(path, gemini, out_dir, formats=("json",)):
    """Annotate a .txt file and write <out_dir>/<file name>.json (and/or .xmi). Returns the written paths."""
    path = Path(path)
    text = path.read_text(encoding="utf-8")  # read as it is: the offsets must point into this exact text
    doc = annotate_text(text, path.stem, gemini)
    return inception.write(doc, out_dir, formats)


def to_inception_json(doc):
    """The INCEpTION document (UIMA CAS JSON) as a string, e.g. to hand it to the demo without a file."""
    return inception.to_cas(doc).to_json(pretty_print=True)
