"""LAYER 4 - TEMPORAL LINKS (TLINKs) between events and temporal expressions.

Prompts: prompts/4_links.txt

    1. pairs      PAIR_DETECTION, sentence by sentence: which entities of the sentence (and of the previous
                  sentence, and the report date) are temporally related. PAIR_DETECTION_MISSING asks again for
                  the events that got no link. The relation is not decided yet.
    2. direction  fixed by the code: event -> temporal expression, otherwise the later -> the earlier mention
    3. relation   one YES/NO step per relation type, most specific first (IDENTITY, BEGINS, ... SIMULTANEOUS);
                  links with NO everywhere: RELATION_FALLBACK, and SIMULTANEOUS (the manual's default) if still open
    4. reports    links between consecutive reports: the report dates are ordered by the code,
                  the rest comes from CROSS_REPORT
"""
import re

from . import config
from .gemini import STR, arr, enum, in_parallel, obj
from .prompts import PROMPTS, fill
from .spans import by_id, entities, markup
from .step2_classification import batches, yes_no_step

RELATIONS = ["BEFORE", "AFTER", "BEFORE_OVERLAP", "AFTER_OVERLAP", "INCLUDES", "IS_INCLUDED", "DURING",
             "SIMULTANEOUS", "IDENTITY", "BEGINS", "ENDS", "BEGUN_BY", "ENDED_BY"]
# A rel B  ==  B INVERSE[rel] A
INVERSE = dict(BEFORE="AFTER", AFTER="BEFORE", BEFORE_OVERLAP="AFTER_OVERLAP", AFTER_OVERLAP="BEFORE_OVERLAP",
               INCLUDES="IS_INCLUDED", IS_INCLUDED="INCLUDES", DURING="INCLUDES", SIMULTANEOUS="SIMULTANEOUS",
               IDENTITY="IDENTITY", BEGINS="BEGUN_BY", BEGUN_BY="BEGINS", ENDS="ENDED_BY", ENDED_BY="ENDS")
# order of the YES/NO steps: the most specific relation first, the default (SIMULTANEOUS) last
RELATION_ORDER = ["IDENTITY", "BEGINS", "ENDS", "BEGUN_BY", "ENDED_BY", "DURING", "INCLUDES", "IS_INCLUDED",
                  "BEFORE_OVERLAP", "AFTER_OVERLAP", "BEFORE", "AFTER", "SIMULTANEOUS"]
LINKS_PATH = "Link Structures › Temporal Links"

PAIRS_SCHEMA = obj(pairs=arr(obj(source=STR, target=STR)))
FALLBACK_SCHEMA = obj(links=arr(obj(id=STR, relation=enum(RELATIONS))))
CROSS_REPORT_SCHEMA = obj(tlinks=arr(obj(source=STR, relation=enum(RELATIONS), target=STR)))


def describe(x):
    """One line per entity for the pair prompt: ID, text and the attributes found so far."""
    if x["kind"] == "EVENT":
        attributes = [x.get("pos"), x.get("event_class"), x.get("tense"), x.get("medical_class"),
                      "NEG" if x.get("polarity") == "NEG" else None]
    else:
        attributes = [x.get("timex_type"), x.get("value"), x.get("function")]
    return f'{x["id"]}: «{x["text"]}» [{", ".join(a for a in attributes if a)}]'


def link_line(doc):
    ids = by_id(doc)
    return lambda l: (f'{l["id"]}: SOURCE ⟦{l["source"]} {ids[l["source"]]["text"]}⟧ → TARGET '
                      f'⟦{l["target"]} {ids[l["target"]]["text"]}⟧')


def add_link(doc, source, target, relation, scope):
    """Add a TLINK with the manual's direction; one link per pair of entities. relation may be None (typed later)."""
    if source is None or target is None or source["id"] == target["id"] or (relation and relation not in INVERSE):
        return None
    if (source["kind"] == "TIMEX3" and target["kind"] == "EVENT") or \
            (source["kind"] == target["kind"] and source["start"] < target["start"]):
        source, target, relation = target, source, INVERSE.get(relation) if relation else None
    pair = frozenset((source["id"], target["id"]))
    if pair in doc["linked_pairs"]:
        return None
    doc["linked_pairs"].add(pair)
    link = dict(id=f"L{len(doc['tlinks']) + 1}", source=source["id"], target=target["id"], relation=relation,
                scope=scope)
    doc["tlinks"].append(link)
    return link


def report_date(doc, report):
    return next((t for t in doc["timexes"] if t.get("is_dct") and t["report"] == report["index"]), None)


# --- 1. which pairs are linked ----------------------------------------------------------------------------
def sentence_windows(doc):
    """Per sentence: (report, i, entities of the sentence, entities of the previous sentence(s), report date, start)."""
    for report in doc["reports"]:
        dct = report_date(doc, report)
        for i, (s, e) in enumerate(report["sentences"]):
            current = [x for x in entities(doc) if x["report"] == report["index"] and x["sentence"] == i]
            if not current:
                continue
            previous = [x for x in entities(doc) if x["report"] == report["index"] and x["sentence"] is not None
                        and i - config.TLINK_WINDOW <= x["sentence"] < i]
            previous_start = report["sentences"][max(0, i - config.TLINK_WINDOW)][0]
            yield report, i, current, previous, dct, previous_start


def find_pairs(doc, gemini):
    ids = by_id(doc)
    doc["tlinks"], doc["linked_pairs"] = [], set()

    def ask(window):
        report, i, current, previous, dct, previous_start = window
        s, e = report["sentences"][i]
        candidates = current + previous + ([dct] if dct else [])
        candidate_ids, current_ids = {x["id"] for x in candidates}, {x["id"] for x in current}
        values = dict(doctime_id=dct["id"] if dct else "(none)", dct=dct["value"] if dct else "unknown",
                      previous=markup(doc, previous_start, s, previous) if previous_start < s else "(none)",
                      current=markup(doc, s, e, current), entities="\n".join(describe(x) for x in candidates))

        def valid(p):
            return p["source"] in candidate_ids and p["target"] in candidate_ids and p["source"] != p["target"] \
                and (p["source"] in current_ids or p["target"] in current_ids)

        answer = gemini.ask(fill("PAIR_DETECTION", **values), PAIRS_SCHEMA, "tlink_pairs") or {}
        pairs = [p for p in answer.get("pairs", []) if valid(p)]
        for _ in range(config.EXTRA_DETECTION_PASSES):  # events of the sentence that are still unlinked
            linked = {x for p in pairs for x in (p["source"], p["target"])}
            unlinked = [x["id"] for x in current if x["kind"] == "EVENT" and x["id"] not in linked]
            if not unlinked:
                break
            prompt = fill("PAIR_DETECTION_MISSING", unlinked=", ".join(unlinked), **values)
            new = [p for p in (gemini.ask(prompt, PAIRS_SCHEMA, "tlink_pairs_missing") or {}).get("pairs", [])
                   if valid(p)]
            if not new:
                break
            pairs += new
        return pairs

    for pairs in in_parallel(ask, list(sentence_windows(doc))):
        for p in pairs:
            add_link(doc, ids[p["source"]], ids[p["target"]], None, "intra-report")


# --- 3. relation type -------------------------------------------------------------------------------------
def relation_fallback(doc, gemini):
    """RELATION_FALLBACK for links that got NO at every relation step; still open -> SIMULTANEOUS."""
    ids = by_id(doc)
    line = link_line(doc)
    jobs = []
    for report in doc["reports"]:
        untyped = [l for l in doc["tlinks"] if l["relation"] is None and ids[l["source"]]["report"] == report["index"]]
        if untyped:
            report_entities = [x for x in entities(doc) if x["report"] == report["index"]]
            report_text = markup(doc, report["body_start"], report["end"], report_entities)
            jobs += [(report_date(doc, report), report_text, batch) for batch in batches(untyped)]

    def ask(job):
        dct, report_text, batch = job
        by = {l["id"]: l for l in batch}

        def make_prompt(selected):
            return fill("RELATION_FALLBACK", doctime_id=dct["id"] if dct else "(none)",
                        dct=dct["value"] if dct else "unknown", relations=PROMPTS["TLINK_RELATIONS"],
                        report=report_text, links="\n".join(line(by[i]) for i in selected))

        return gemini.ask_each(make_prompt, list(by), FALLBACK_SCHEMA, "relation_fallback", key="links")

    links = {l["id"]: l for l in doc["tlinks"]}
    for answers in in_parallel(ask, jobs):
        for link_id, a in answers.items():
            if links[link_id]["relation"] is None:
                links[link_id]["relation"] = a["relation"]
    for l in doc["tlinks"]:
        if l["relation"] is None:  # the manual's default when nothing allows a more specific relation
            l["relation"] = "SIMULTANEOUS"


def type_links(doc, gemini):
    for k, relation in enumerate(RELATION_ORDER, 1):
        label = f"TLINK_{relation.lower()}"
        untyped = [l for l in doc["tlinks"] if l["relation"] is None]
        yes = yes_no_step(doc, gemini, f"P3.{k}", f"{LINKS_PATH} › {label}", label,
                          PROMPTS[f"RELATION: {relation}"], untyped, link_line(doc), prompt_name="RELATION_STEP")
        for l in untyped:
            if l["id"] in yes:
                l["relation"] = relation
    relation_fallback(doc, gemini)


# --- 4. links between consecutive reports -------------------------------------------------------------------
def compare_dates(a, b):
    """-1 / 0 / 1 if both are ISO dates (compared at the coarser granularity), else None."""
    if not (a and b and re.fullmatch(r"\d{4}(-\d\d){0,2}", a) and re.fullmatch(r"\d{4}(-\d\d){0,2}", b)):
        return None
    n = min(len(a), len(b))
    return (a[:n] > b[:n]) - (a[:n] < b[:n])


DATE_ORDER = {-1: "BEFORE", 0: "SIMULTANEOUS", 1: "AFTER"}


def cross_report_links(doc, gemini):
    ids = by_id(doc)
    report_dates = {t["report"]: t for t in doc["timexes"] if t.get("is_dct")}

    # without a prompt: report date vs the previous report's date, and vs admission / discharge dates
    for report in doc["reports"][1:]:
        current, previous = report_dates.get(report["index"]), report_dates.get(report["index"] - 1)
        if current and previous and compare_dates(current["value"], previous["value"]) is not None:
            add_link(doc, current, previous, DATE_ORDER[compare_dates(current["value"], previous["value"])],
                     "cross-report")
    for t in doc["timexes"]:
        dct = report_dates.get(t["report"])
        if dct and t is not dct and t.get("function") in ("ADMISSION_TIME", "DISCHARGE_TIME"):
            order = compare_dates(dct["value"], t["value"])
            if order is not None:
                add_link(doc, dct, t, DATE_ORDER[order], "intra-report")

    def ask(report):
        previous_events = [ev for ev in doc["events"] if ev["report"] == report["index"] - 1]
        current_events = [ev for ev in doc["events"] if ev["report"] == report["index"]]
        if not previous_events or not current_events:
            return []
        previous_report = doc["reports"][report["index"] - 1]
        prompt = fill("CROSS_REPORT", relations=PROMPTS["TLINK_RELATIONS"], first=current_events[0]["id"],
                      last=previous_events[-1]["id"],
                      dct_previous=previous_report["dct"] and previous_report["dct"]["value"],
                      dct_current=report["dct"] and report["dct"]["value"],
                      previous=markup(doc, previous_report["body_start"], previous_report["end"], previous_events),
                      current=markup(doc, report["body_start"], report["end"], current_events))
        answer = gemini.ask(prompt, CROSS_REPORT_SCHEMA, "cross_report") or {}
        previous_ids, current_ids = {ev["id"] for ev in previous_events}, {ev["id"] for ev in current_events}
        return [l for l in answer.get("tlinks", []) if {l["source"], l["target"]} & previous_ids
                and {l["source"], l["target"]} & current_ids]

    for links in in_parallel(ask, doc["reports"][1:]):
        for l in links:
            add_link(doc, ids[l["source"]], ids[l["target"]], l["relation"], "cross-report")


def run(doc, gemini):
    find_pairs(doc, gemini)
    type_links(doc, gemini)
    cross_report_links(doc, gemini)
