"""LAYER 1 - DETECTION: find the events and the temporal expressions of every sentence.

Prompts: prompts/1_detection.txt

Events, sentence by sentence (all sentences in parallel):
    1. EVENT_DETECTION          Gemini lists the events of the sentence
    2. EVENT_DETECTION_MISSING  the sentence is shown back with the events found so far; Gemini adds missing ones
    3. EVENT_VERIFICATION       every candidate is checked: KEEP / DROP / FIX the span
    4. PARTICIPANT_CHECK        candidates that are anatomy, drugs, people, places, values ... are removed
    5. rules                    values cut off ("estadio IV" -> "estadio"), location adjectives and
                                single function words / numbers removed
Temporal expressions:
    the header dates are taken from the text directly (no prompt), then TIMEX_DETECTION + TIMEX_DETECTION_MISSING.
    Events that overlap a temporal expression are removed (a temporal expression is not an event).
"""
import logging
import re

from . import config
from .document import fold
from .gemini import STR, arr, enum, in_parallel, obj
from .prompts import PROMPTS, fill
from .spans import FUNCTION_WORDS, ground, markup

log = logging.getLogger("medtime")

# Gemini gives a category with every event; only used here (a verb is never dropped) and in layer 2.
EVENT_CATEGORIES = ["VERB", "PREDICATIVE", "CONDITION", "EXAMINATION", "TREATMENT_OR_PROCEDURE", "EVENT_NOUN",
                    "LEXICALISED", "PRONOUN"]
EVENT_SCHEMA = obj(items=arr(obj(text=STR, category=enum(EVENT_CATEGORIES))))
TIMEX_SCHEMA = obj(items=arr(obj(text=STR)))
VERIFICATION_SCHEMA = obj(items=arr(obj(id=STR, decision=enum(["KEEP", "DROP", "FIX"]), corrected=STR)))
PARTICIPANT_KINDS = ["NONE", "ANATOMY", "PLACE", "PERSON", "DRUG", "BIO_ENTITY", "PROTOCOL_OR_VALUE"]
PARTICIPANT_SCHEMA = obj(items=arr(obj(id=STR, denotes=enum(PARTICIPANT_KINDS))))

# words that characterise a disease (manual: Characterization of the Disease) are events, never participants
DISEASE_SCORES = {"ecog", "ipi", "estadio", "estadiamento", "grau", "karnofsky", "flipi", "score", "risco"}

# safety net for the most frequent single-word non-events
NON_EVENT_WORDS = {"doente", "paciente", "médico", "medico", "dador", "hospital", "serviço", "servico", "meses", "mes",
                   "mês", "anos", "ano", "dias", "dia", "semanas", "semana", "horas", "hora", "recentemente",
                   "atualmente", "actualmente", "após", "apos", "antes", "depois", "cerca", "ontem", "hoje",
                   "analiticamente", "sobretudo", "provável", "provavel"}

# words that are not temporal expressions in the manual (connectives, bare frequencies)
NON_MARKABLE_TIMES = {"entao", "entretanto", "antes", "depois", "apos", "quando", "enquanto", "durante", "nunca",
                      "frequente", "raramente", "usualmente", "permanentemente", "temporariamente", "uma vez"}

# an adjective that only gives a location ("... e mesentéricas") is not an event (annotator feedback)
LOCATION_ADJECTIVE_RE = re.compile(r"^[a-z-]+(?:ais|al|ares|ar|icas?|icos?|iacas?|iacos?)$")
NOT_LOCATION = {"normal", "anormal", "habitual", "total", "parcial", "final", "inicial", "atual", "actual", "geral",
                "grave", "fatal", "letal", "global", "focal", "regular", "irregular", "familiar", "similar",
                "clinica", "clinico", "cronica", "cronico", "aguda", "agudo", "critica", "critico"}

TRAILING_VALUE_RE = re.compile(r"(?:\s+(?:de|a|=)?\s*(?:[IVXLC]+|\d[\d.,]*\s*%?))+$")


def previous_sentence(doc, report, i):
    return doc["text"][slice(*report["sentences"][i - 1])] if i > 0 else "(none)"


def detect_in_sentence(doc, gemini, report, i, kind):
    """Ask for the events (kind="EVENT") or temporal expressions (kind="TIMEX") of sentence i.

    First pass, then up to EXTRA_DETECTION_PASSES passes asking only for what is still missing.
    Returns a list of (start, end).
    """
    text = doc["text"]
    s, e = report["sentences"][i]
    is_event = kind == "EVENT"
    values = dict(previous_sentence=previous_sentence(doc, report, i))
    if is_event:
        values["event_rules"] = PROMPTS["EVENT_RULES"]
        first, missing, schema, name = "EVENT_DETECTION", "EVENT_DETECTION_MISSING", EVENT_SCHEMA, "events"
    else:
        values["timex_rules"] = PROMPTS["TIMEX_RULES"]
        first, missing, schema, name = "TIMEX_DETECTION", "TIMEX_DETECTION_MISSING", TIMEX_SCHEMA, "timexes"

    answer = gemini.ask(fill(first, sentence=text[s:e], **values), schema, name) or {}
    items = answer.get("items", [])
    found = ground(doc, [x["text"] for x in items], s, e, strip_function_words=is_event)
    for x, span in zip(items, found):
        if span and x.get("category"):
            doc["categories"][span] = x["category"]
    spans = [span for span in found if span]

    for _ in range(config.EXTRA_DETECTION_PASSES):
        marks = [dict(id=f"M{n}", start=a, end=b) for n, (a, b) in enumerate(sorted(set(spans)), 1)]
        prompt = fill(missing, marked_sentence=markup(doc, s, e, marks), **values)
        items = (gemini.ask(prompt, schema, name + "_missing") or {}).get("items", [])
        found = ground(doc, [x["text"] for x in items], s, e, strip_function_words=is_event)
        for x, span in zip(items, found):
            if span and x.get("category"):
                doc["categories"].setdefault(span, x["category"])
        new = [span for span in found if span and span not in spans]
        if not new:
            break
        spans += new
    return spans


def verify_events(doc, gemini, spans, s, e):
    """EVENT_VERIFICATION: Gemini judges every candidate (KEEP / DROP / FIX the span)."""
    if not spans:
        return spans
    text = doc["text"]
    candidates = sorted(set(spans))
    by_cid = {f"C{n}": span for n, span in enumerate(candidates, 1)}

    def make_prompt(ids):
        return fill("EVENT_VERIFICATION", event_rules=PROMPTS["EVENT_RULES"], sentence=text[s:e],
                    candidates="\n".join(f"{i}: «{text[slice(*by_cid[i])]}»" for i in ids))

    decisions = gemini.ask_each(make_prompt, list(by_cid), VERIFICATION_SCHEMA, "event_verification")
    kept = []
    for n, (a, b) in enumerate(candidates, 1):
        d = decisions.get(f"C{n}", {"decision": "KEEP", "corrected": ""})
        if d["decision"] == "DROP":
            if doc["categories"].get((a, b)) != "VERB":  # a main verb is never dropped
                log.debug("verification dropped «%s»", text[a:b])
                continue
        if d["decision"] == "FIX" and d["corrected"].strip():
            fixed = ground(doc, [d["corrected"]], a, b, strip_function_words=True)[0]
            if fixed:
                a, b = fixed
        kept.append((a, b))
    return kept


def drop_participants(doc, gemini, spans, s, e):
    """PARTICIPANT_CHECK: remove candidates that are participants of events, not events."""
    if not spans:
        return spans
    text = doc["text"]
    candidates = sorted(set(spans))
    by_cid = {f"C{n}": span for n, span in enumerate(candidates, 1)}

    def make_prompt(ids):
        return fill("PARTICIPANT_CHECK", sentence=text[s:e],
                    candidates="\n".join(f"{i}: «{text[slice(*by_cid[i])]}»" for i in ids))

    answers = gemini.ask_each(make_prompt, list(by_cid), PARTICIPANT_SCHEMA, "participant_check")
    kept = []
    for n, (a, b) in enumerate(candidates, 1):
        kind = answers[f"C{n}"]["denotes"] if f"C{n}" in answers else "NONE"
        if fold(text[a:b]).split()[0] in DISEASE_SCORES or doc["categories"].get((a, b)) == "VERB":
            kind = "NONE"
        if kind == "NONE":
            kept.append((a, b))
        else:
            log.debug("participant check dropped «%s» (%s)", text[a:b], kind)
    return kept


def cut_trailing_value(text, a, b):
    """'estadio IV' -> 'estadio', 'IPI de 5' -> 'IPI' (the value is not part of the event)."""
    m = TRAILING_VALUE_RE.search(text[a:b])
    return (a, a + m.start()) if m and m.start() > 0 else (a, b)


def drop_location_adjectives(doc, spans):
    """Drop a single location adjective that directly follows another event ("..., axilares e inguinais")."""
    text, kept, previous_end = doc["text"], [], None
    for a, b in sorted(set(spans)):
        word = fold(text[a:b])
        gap = text[previous_end:a] if previous_end is not None else None
        if (" " not in word and LOCATION_ADJECTIVE_RE.match(word) and word not in NOT_LOCATION
                and doc["categories"].get((a, b)) not in ("VERB", "PREDICATIVE")
                and gap is not None and re.fullmatch(r"[\s,]*(?:e\s+)?", gap)):
            log.debug("location adjective «%s» dropped", text[a:b])
        else:
            kept.append((a, b))
        previous_end = b
    return kept


def is_markable(text, a, b):
    """False for spans that can never be events: only function words, numbers, roman numerals, 'doente', ..."""
    span = text[a:b]
    words = fold(span).split()
    if not any(c.isalpha() for c in span) or all(w in FUNCTION_WORDS for w in words):
        return False
    if len(words) == 1 and (words[0] in NON_EVENT_WORDS or re.fullmatch(r"[ivxlc]+|\d+\w*%?", words[0])):
        return False
    return True


def detect_events(doc, gemini):
    text = doc["text"]
    jobs = [(report, i) for report in doc["reports"] for i in range(len(report["sentences"]))]

    def one_sentence(job):
        report, i = job
        s, e = report["sentences"][i]
        if not re.search(r"\w", text[s:e]):
            return []
        spans = detect_in_sentence(doc, gemini, report, i, "EVENT")
        spans = verify_events(doc, gemini, spans, s, e)
        spans = [cut_trailing_value(text, a, b) for a, b in drop_participants(doc, gemini, spans, s, e)]
        spans = drop_location_adjectives(doc, spans)
        return [dict(start=a, end=b, report=report["index"], sentence=i) for a, b in spans]

    seen, events = set(), []
    found = [ev for evs in in_parallel(one_sentence, jobs) for ev in evs]
    for ev in sorted(found, key=lambda x: (x["start"], x["end"])):
        if (ev["start"], ev["end"]) not in seen and is_markable(text, ev["start"], ev["end"]):
            seen.add((ev["start"], ev["end"]))
            events.append(ev)
    for n, ev in enumerate(events, 1):
        ev.update(id=f"E{n}", kind="EVENT", text=text[ev["start"]:ev["end"]],
                  category=doc["categories"].get((ev["start"], ev["end"])))
    doc["events"] = events


def detect_timexes(doc, gemini):
    text = doc["text"]
    timexes = []
    for report in doc["reports"]:  # header dates: no prompt needed
        for d in report["header_dates"]:
            timexes.append(dict(start=d["start"], end=d["end"], report=report["index"], sentence=None,
                                timex_type="DATE", value=d["value"], function=d["function"], header=True,
                                is_dct=d is report["dct"]))

    jobs = [(report, i) for report in doc["reports"] for i in range(len(report["sentences"]))]

    def one_sentence(job):
        report, i = job
        return [dict(start=a, end=b, report=report["index"], sentence=i)
                for a, b in detect_in_sentence(doc, gemini, report, i, "TIMEX")]

    def keep(t):
        m = re.match(r"mais\s+", text[t["start"]:t["end"]], re.I)
        if m:  # manual: "mais recentemente" -> the temporal expression is "recentemente"
            t["start"] += m.end()
        return fold(text[t["start"]:t["end"]]) not in NON_MARKABLE_TIMES

    seen = {(t["start"], t["end"]) for t in timexes}
    found = [t for ts in in_parallel(one_sentence, jobs) for t in ts if keep(t)]
    for t in sorted(found, key=lambda x: x["start"]):
        if (t["start"], t["end"]) not in seen and any(c.isalnum() for c in text[t["start"]:t["end"]]):
            seen.add((t["start"], t["end"]))
            timexes.append(dict(t, timex_type=None, value=None, function=None))
    timexes.sort(key=lambda t: t["start"])
    for n, t in enumerate(timexes, 1):
        t.update(id=f"T{n}", kind="TIMEX3", text=text[t["start"]:t["end"]], anchor=None)
    doc["timexes"] = timexes

    def is_time(ev):
        return any(t["start"] <= ev["start"] and ev["end"] <= t["end"] or
                   ev["start"] <= t["start"] and t["end"] <= ev["end"] for t in timexes)
    doc["events"] = [ev for ev in doc["events"] if not is_time(ev)]


def run(doc, gemini):
    doc["categories"] = {}  # (start, end) -> event category given by Gemini
    detect_events(doc, gemini)
    detect_timexes(doc, gemini)
