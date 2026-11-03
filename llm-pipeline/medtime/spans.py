"""From the text that Gemini returns to character offsets, and back to marked-up text for the next prompt.

Gemini answers with the surface text of each annotation ("anemia"), never with offsets (LLMs count characters
badly). `ground` finds that text in the sentence: accent- and case-insensitive, in order of appearance, and trims
it to whole tokens without leading determiners / prepositions (Med2Story span rules).

`markup` does the opposite for the next prompts: it writes the entities into the text as ⟦E3 anemia⟧, so that
Gemini can refer to them by ID.
"""
import logging
import re
from bisect import bisect_right

from .document import fold

log = logging.getLogger("medtime")

TRIM_CHARS = " \t\n,;:.!?\"'«»“”"
DETERMINERS = {"o", "a", "os", "as", "um", "uma", "uns", "umas"}
# words that never start an event (determiners, prepositions and their contractions, conjunctions);
# "em" is not here because of fixed expressions such as "em remissão completa"
LEADING_FUNCTION_WORDS = DETERMINERS | {"e", "ou", "de", "do", "da", "dos", "das", "com", "para", "por", "pelo",
                                        "pela", "pelos", "pelas", "no", "na", "nos", "nas", "ao", "à", "aos", "às",
                                        "até", "desde", "sem", "num", "numa", "dum", "duma"}
FUNCTION_WORDS = LEADING_FUNCTION_WORDS | {"em", "que", "se", "não", "nem", "onde", "quando", "como", "mais",
                                          "muito", "ainda", "já", "então"}


def snap_to_tokens(doc, a, b):
    """Widen (a, b) so that it does not cut a token in half."""
    starts = [t[0] for t in doc["tokens"]]
    i = bisect_right(starts, a) - 1
    if i >= 0 and doc["tokens"][i][0] <= a < doc["tokens"][i][1]:
        a = doc["tokens"][i][0]
    j = bisect_right(starts, b - 1) - 1
    if j >= 0 and doc["tokens"][j][0] <= b - 1 < doc["tokens"][j][1]:
        b = doc["tokens"][j][1]
    return a, b


def trim_span(text, a, b, strip_function_words=False):
    """Remove punctuation around the span, leading function words (events only) and unbalanced brackets."""
    while a < b and text[a] in TRIM_CHARS:
        a += 1
    while b > a and text[b - 1] in TRIM_CHARS:
        b -= 1
    while strip_function_words:
        m = re.match(r"(\w+)\s+\S", text[a:b])
        if not (m and m.group(1).lower() in LEADING_FUNCTION_WORDS):
            break
        a += m.end(1)
        while a < b and text[a].isspace():
            a += 1
    if text[a:b].count("(") < text[a:b].count(")") and text[b - 1] == ")":
        b -= 1
    if text[a:b].count("(") > text[a:b].count(")") and text[a] == "(":
        a += 1
    return a, b


def ground(doc, strings, start, end, strip_function_words=False):
    """Find each string inside text[start:end]. Returns [(begin, end) or None], in the order of `strings`."""
    text = doc["text"]
    haystack = fold(text[start:end])
    cursor, spans = 0, []
    for s in strings:
        s = re.sub(r"^\s*[A-Z]\d+[:.]?\s+", "", s or "")  # "M1 antecedentes" -> "antecedentes"
        words = fold(s.strip(TRIM_CHARS)).split()
        if not words:
            spans.append(None)
            continue
        pattern = re.compile(r"(?<!\w)" + r"\s*".join(re.escape(w) for w in words) + r"(?!\w)")
        m = pattern.search(haystack, cursor) or pattern.search(haystack)
        if not m:
            log.debug("not found in the text: «%s»", s)
            spans.append(None)
            continue
        if m.start() >= cursor:
            cursor = m.end()
        a, b = trim_span(text, start + m.start(), start + m.end(), strip_function_words)
        spans.append(snap_to_tokens(doc, a, b) if a < b else None)
    return spans


def sentence_of(report, position):
    for i, (s, e) in enumerate(report["sentences"]):
        if s <= position < e:
            return i
    return None


def entities(doc):
    return doc["events"] + doc["timexes"]


def by_id(doc):
    return {x["id"]: x for x in entities(doc)}


def markup(doc, start, end, items):
    """text[start:end] with the given entities written in as ⟦E3 text⟧ (nested ones are skipped)."""
    text, out, position = doc["text"], [], start
    inside = [x for x in items if start <= x["start"] and x["end"] <= end]
    for x in sorted(inside, key=lambda x: (x["start"], -x["end"])):
        if x["start"] < position:
            continue
        out.append(text[position:x["start"]])
        out.append(f"⟦{x['id']} {text[x['start']:x['end']]}⟧")
        position = x["end"]
    out.append(text[position:end])
    return "".join(out)


def add_timex(doc, start, end, report_index):
    """Add a temporal expression found by a later step (returns the existing one if the span is known).

    Temporal expressions are not events, so events that overlap it this way are removed.
    """
    for t in doc["timexes"]:
        if (t["start"], t["end"]) == (start, end):
            return t
    number = 1 + max([int(t["id"][1:]) for t in doc["timexes"]] or [0])
    report = doc["reports"][report_index]
    timex = dict(id=f"T{number}", kind="TIMEX3", start=start, end=end, text=doc["text"][start:end], report=report_index,
                 sentence=sentence_of(report, start), timex_type=None, value=None, function=None, anchor=None)
    doc["timexes"].append(timex)
    doc["timexes"].sort(key=lambda t: t["start"])
    doc["events"] = [ev for ev in doc["events"] if not (start <= ev["start"] and ev["end"] <= end
                                                        or ev["start"] <= start and end <= ev["end"])]
    return timex
