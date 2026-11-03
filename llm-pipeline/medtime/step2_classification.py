"""LAYER 2 - CLASSIFICATION: walk the events and temporal expressions down the Med2Story tree.

Prompts: prompts/2_classification.txt

Most decisions are YES/NO questions (YES_NO_STEP), asked for a batch of candidates with the whole report as
context. The order is the order of the Med2Story tree:

    a. Specialized Event?            YES -> specialized (medical) event, NO -> general event. Verbs are never asked.
    b. type of temporal expressions  TIMEX_TYPE_STEP for Date, Time, Duration, Set; expressions with no type or
                                     with more than one go to TIMEX_TYPE_FALLBACK
    c. medical class                 one YES/NO step per class in Decision Tree 1 order; an event leaves the
                                     cascade at its first YES. Events with NO everywhere: MEDICAL_CLASS_FALLBACK
    d. Personal History attribute    Past Medical History -> Comorbidity -> Undefined (NO everywhere = Undefined)

<<step>> / <<path>> in the prompts name the node of the tree (P1.1.4 = Event › Specialized Event › Examination).
"""
from . import config
from .document import fold
from .gemini import STR, arr, enum, in_parallel, obj
from .prompts import PROMPTS, fill
from .spans import add_timex, by_id, entities, ground, markup

# Decision Tree 1 order of the manual (the first YES wins)
MEDICAL_CLASSES = ["SIGN_OR_SYMPTOM", "PERSONAL_HISTORY", "INTERCURRENCE", "EXAMINATION", "EXAMINATION_RESULT",
                   "PRINCIPAL_DIAGNOSIS", "CHARACTERIZATION_OF_THE_DISEASE", "MEDICAL_PROCEDURE", "TREATMENT",
                   "DRUG_ADMINISTRATION_ROUTE", "TREATMENT_RESPONSE"]
CLASS_NAMES = {"SIGN_OR_SYMPTOM": "Sign or Symptom", "PERSONAL_HISTORY": "Personal History",
               "INTERCURRENCE": "Intercurrence", "EXAMINATION": "Examination",
               "EXAMINATION_RESULT": "Examination Result", "PRINCIPAL_DIAGNOSIS": "Principal Diagnosis",
               "CHARACTERIZATION_OF_THE_DISEASE": "Characterization of the Disease",
               "MEDICAL_PROCEDURE": "Medical Procedure", "TREATMENT": "Treatment",
               "DRUG_ADMINISTRATION_ROUTE": "Drug Administration Route", "TREATMENT_RESPONSE": "Treatment Response"}
PERSONAL_HISTORY = ["PAST_MEDICAL_HISTORY", "COMORBIDITY", "UNDEFINED"]
HISTORY_NAMES = {"PAST_MEDICAL_HISTORY": "Past Medical History", "COMORBIDITY": "Comorbidity",
                 "UNDEFINED": "Undefined"}
TIMEX_TYPES = ["DATE", "TIME", "DURATION", "SET"]
TIMEX_TYPE_NAMES = {"DATE": "Date", "TIME": "Time", "DURATION": "Duration", "SET": "Set"}

YES_NO_SCHEMA = obj(items=arr(obj(id=STR, answer=enum(["YES", "NO"]))))
CLASS_FALLBACK_SCHEMA = obj(events=arr(obj(id=STR, medical_class=enum(MEDICAL_CLASSES))))
TIMEX_TYPE_SCHEMA = obj(items=arr(obj(id=STR, text=STR)))
TIMEX_FALLBACK_SCHEMA = obj(timexes=arr(obj(id=STR, type=enum(TIMEX_TYPES))))

SPECIALIZED_PATH = "Entity Structures › Event › Specialized Event"
TIMEX_PATH = "Entity Structures › Temporal Expressions"


def batches(items, size=config.BATCH_SIZE):
    return [items[i:i + size] for i in range(0, len(items), size)]


def event_line(ev):
    return f'{ev["id"]}: «{ev["text"]}»'


def is_verb(ev):
    return ev.get("category") == "VERB" or ev.get("pos") == "VERB"


def medical_events(doc):
    return [ev for ev in doc["events"] if ev.get("domain") == "MEDICAL" and not is_verb(ev)]


def yes_no_step(doc, gemini, step, path, label, definition, candidates, line, prompt_name="YES_NO_STEP"):
    """Ask "is it <label>?" for every candidate (events, or links in layer 4). Returns the IDs answered YES.

    The candidates are asked report by report, in batches, with the report text (entities marked) as context.
    """
    ids = by_id(doc)
    jobs = []
    for report in doc["reports"]:
        here = [c for c in candidates if (c["report"] if "report" in c else ids[c["source"]]["report"])
                == report["index"]]
        if here:
            report_entities = [x for x in entities(doc) if x["report"] == report["index"]]
            report_text = markup(doc, report["body_start"], report["end"], report_entities)
            jobs += [(report_text, batch) for batch in batches(here)]

    def ask(job):
        report_text, batch = job
        by = {c["id"]: c for c in batch}

        def make_prompt(selected):
            return fill(prompt_name, step=step, path=path, label=label, definition=definition, report=report_text,
                        candidates="\n".join(line(by[i]) for i in selected))

        answers = gemini.ask_each(make_prompt, list(by), YES_NO_SCHEMA, "yes_no_step")
        return {i for i, a in answers.items() if a["answer"] == "YES"}

    return set().union(*in_parallel(ask, jobs)) if jobs else set()


# --- a. Specialized or General Event ----------------------------------------------------------------------
def specialized_or_general(doc, gemini):
    candidates = [ev for ev in doc["events"] if not is_verb(ev)]
    yes = yes_no_step(doc, gemini, "P1.1", SPECIALIZED_PATH, "Specialized Event", PROMPTS["SPECIALIZED_EVENT"],
                      candidates, event_line)
    for ev in doc["events"]:
        ev["domain"] = "MEDICAL" if ev["id"] in yes else "GENERAL"
        ev.update(medical_class=None, personal_history=None, observations=None)


# --- b. type of the temporal expressions -------------------------------------------------------------------
def body_timexes(doc):
    """Temporal expressions of the report bodies (the header dates already have their type)."""
    return [t for t in doc["timexes"] if not t.get("header")]


def timex_type_step(doc, gemini, step, ttype):
    """TIMEX_TYPE_STEP: Gemini picks the expressions of this type (and may add one that layer 1 missed)."""
    label = TIMEX_TYPE_NAMES[ttype]
    jobs = []
    for report in doc["reports"]:
        here = [t for t in body_timexes(doc) if t["report"] == report["index"]]
        if here:
            report_text = markup(doc, report["body_start"], report["end"], here)
            jobs += [(report, report_text, batch) for batch in batches(here)]

    def ask(job):
        report, report_text, batch = job
        prompt = fill("TIMEX_TYPE_STEP", step=step, path=f"{TIMEX_PATH} › {label}", label=label,
                      definition=PROMPTS[f"TIMEX_TYPE: {ttype}"], report=report_text,
                      candidates="\n".join(f'{t["id"]}: «{t["text"]}»' for t in batch))
        answer = gemini.ask(prompt, TIMEX_TYPE_SCHEMA, "timex_type_step") or {}
        ids = {t["id"] for t in batch}
        chosen = {item["id"] for item in answer.get("items", []) if item["id"] in ids}
        new_texts = [item["text"] for item in answer.get("items", [])
                     if item["id"] not in ids and item["text"].strip()]
        return report, chosen, new_texts

    selected = set()
    for report, chosen, new_texts in in_parallel(ask, jobs):
        selected |= chosen
        for span in ground(doc, new_texts, report["body_start"], report["end"]):
            if span:
                selected.add(add_timex(doc, *span, report["index"])["id"])
    for t in doc["timexes"]:
        if t["id"] in selected:
            t.setdefault("claimed_types", [])
            if ttype not in t["claimed_types"]:
                t["claimed_types"].append(ttype)


def timex_type_fallback(doc, gemini):
    """TIMEX_TYPE_FALLBACK: one single-choice question per report for the expressions still without type."""
    jobs = []
    for report in doc["reports"]:
        here = [t for t in body_timexes(doc) if t["report"] == report["index"]]
        untyped = [t for t in here if not t.get("timex_type")]
        if untyped:
            jobs.append((untyped, markup(doc, report["body_start"], report["end"], here)))

    def ask(job):
        untyped, report_text = job
        prompt = fill("TIMEX_TYPE_FALLBACK", step="P2.5",
                      path=f"{TIMEX_PATH} › reconciliation: type of unextracted expressions", report=report_text,
                      timexes="\n".join(f'{t["id"]}: «{t["text"]}»' for t in untyped))
        return (gemini.ask(prompt, TIMEX_FALLBACK_SCHEMA, "timex_type_fallback") or {}).get("timexes", [])

    by = {t["id"]: t for t in doc["timexes"]}
    for answers in in_parallel(ask, jobs):
        for a in answers:
            if a["id"] in by and not by[a["id"]].get("timex_type"):
                by[a["id"]]["timex_type"] = a["type"]


def type_timexes(doc, gemini):
    for i, ttype in enumerate(TIMEX_TYPES, 1):
        timex_type_step(doc, gemini, f"P2.{i}", ttype)
    for t in doc["timexes"]:  # exactly one type claimed -> that type; none or several -> fallback question
        claimed = t.pop("claimed_types", [])
        if not t.get("header"):
            t["timex_type"] = claimed[0] if len(claimed) == 1 else None
    timex_type_fallback(doc, gemini)


# --- c. medical class (Decision Tree 1) -------------------------------------------------------------------
def medical_class_fallback(doc, gemini):
    """MEDICAL_CLASS_FALLBACK for specialized events that answered NO at every class step."""
    leftover = {ev["id"] for ev in medical_events(doc) if not ev.get("medical_class")}
    jobs = []
    for report in doc["reports"]:
        report_events = [ev for ev in doc["events"] if ev["report"] == report["index"]]
        here = [ev for ev in report_events if ev["id"] in leftover]
        if here:
            report_text = markup(doc, report["body_start"], report["end"], report_events)
            jobs += [(report_text, batch) for batch in batches(here)]

    def ask(job):
        report_text, batch = job
        by = {ev["id"]: ev for ev in batch}

        def make_prompt(selected):
            return fill("MEDICAL_CLASS_FALLBACK", step="P1.1.12",
                        path=f"{SPECIALIZED_PATH} › reconciliation: Decision Tree 1 for events no step took",
                        report=report_text,
                        events="\n".join(f'{i}: «{by[i]["text"]}» (pos={by[i].get("pos")})' for i in selected))

        return gemini.ask_each(make_prompt, list(by), CLASS_FALLBACK_SCHEMA, "medical_class_fallback", key="events")

    events = {ev["id"]: ev for ev in doc["events"]}
    for answers in in_parallel(ask, jobs):
        for event_id, a in answers.items():
            events[event_id]["medical_class"] = a["medical_class"]


def classify_medical_events(doc, gemini):
    for i, cls in enumerate(MEDICAL_CLASSES, 1):
        remaining = [ev for ev in medical_events(doc) if not ev.get("medical_class")]
        yes = yes_no_step(doc, gemini, f"P1.1.{i}", f"{SPECIALIZED_PATH} › {CLASS_NAMES[cls]}", CLASS_NAMES[cls],
                          PROMPTS[f"CLASS: {cls}"], remaining, event_line)
        for ev in remaining:
            if ev["id"] in yes:
                ev["medical_class"] = cls
    medical_class_fallback(doc, gemini)
    for ev in doc["events"]:  # general events and verbs carry no medical class
        if ev.get("domain") != "MEDICAL" or is_verb(ev):
            ev["medical_class"] = ev["personal_history"] = None


# --- d. Personal History attribute -------------------------------------------------------------------------
def personal_history(doc, gemini):
    path = f"{SPECIALIZED_PATH} › Personal History"
    for i, attribute in enumerate(PERSONAL_HISTORY, 1):
        remaining = [ev for ev in doc["events"] if ev.get("medical_class") == "PERSONAL_HISTORY"
                     and not ev.get("personal_history") and not fold(ev["text"]).startswith("antecedentes")]
        yes = yes_no_step(doc, gemini, f"P1.1.2.{i}", f"{path} › {HISTORY_NAMES[attribute]}",
                          HISTORY_NAMES[attribute], PROMPTS[f"HISTORY: {attribute}"], remaining, event_line)
        for ev in remaining:
            if ev["id"] in yes:
                ev["personal_history"] = attribute
            elif attribute == "UNDEFINED":  # NO at every step: it is unclear whether it is still present
                ev["personal_history"] = "UNDEFINED"


def run(doc, gemini):
    specialized_or_general(doc, gemini)
    type_timexes(doc, gemini)
    classify_medical_events(doc, gemini)
    personal_history(doc, gemini)
