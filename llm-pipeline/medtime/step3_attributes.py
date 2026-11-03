"""LAYER 3 - ATTRIBUTES of the events and temporal expressions.

Prompts: prompts/3_attributes.txt

    OBSERVATIONS   full form of the abbreviations in specialized events ("LDH" -> "lactato desidrogenase")
    MORPHOSYNTAX   pos, polarity, tense, aspect, vform, mood, modality   (all events, one sentence per prompt)
    SEMANTICS      aspectual class and type                              (verb events only)
    TIMEX_VALUE    ISO value, function in the document, anchor           (temporal expressions, one report per prompt)

After the prompts some rules of the manual / the annotators are applied:
    - a gerund ("-ndo") has no tense; a verb is always a General Event (never a medical class)
    - verbs listed in the manual for a class get that class ("relatou" -> Reporting, "iniciou" -> Aspectual, ...)
    - imperfect "-ava" -> Imperfective, perfect "-ou" / "-aram" -> Perfective
    - durations are computed from the text ("79 anos" -> P79Y)
"""
import re

from .document import fold
from .gemini import STR, arr, enum, in_parallel, obj
from .prompts import fill
from .spans import markup
from .step2_classification import SPECIALIZED_PATH, batches

POS = ["VERB", "NOUN", "ADJECTIVE", "PREPOSITION", "PRONOUN"]
POLARITIES = ["POS", "NEG"]
TENSES = ["PRESENT", "PAST", "FUTURE", "NONE"]
ASPECTS = ["PROGRESSIVE", "PERFECTIVE", "IMPERFECTIVE", "PERFECTIVE_PROGRESSIVE", "IMPERFECTIVE_PROGRESSIVE", "NONE"]
VFORMS = ["GERUNDIVE", "INFINITIVE", "PARTICIPLE", "NONE"]
MOODS = ["SUBJUNCTIVE", "CONDITIONAL", "FUTURE", "NONE"]
MODALITIES = ["DEVER", "PODER", "TER_DE", "SER_CAPAZ_DE", "NONE"]
EVENT_CLASSES = ["OCCURRENCE", "STATE", "REPORTING", "PERCEPTION", "ASPECTUAL", "I_ACTION", "I_STATE"]
EVENT_TYPES = ["STATE", "PROCESS", "TRANSITION"]
TIMEX_FUNCTIONS = ["NONE", "ADMISSION_TIME", "DISCHARGE_TIME"]

MORPHOSYNTAX_SCHEMA = obj(events=arr(obj(id=STR, pos=enum(POS), polarity=enum(POLARITIES), tense=enum(TENSES),
                                         aspect=enum(ASPECTS), vform=enum(VFORMS), mood=enum(MOODS),
                                         modality=enum(MODALITIES))))
SEMANTICS_SCHEMA = obj(events=arr(obj(id=STR, event_class=enum(EVENT_CLASSES), event_type=enum(EVENT_TYPES))))
OBSERVATIONS_SCHEMA = obj(events=arr(obj(id=STR, observations=STR)))
# freq / quant are asked as well (part of the TIMEX3 standard) but the INCEpTION layer has no field for them
TIMEX_VALUE_SCHEMA = obj(timexes=arr(obj(id=STR, value=STR, freq=STR, quant=STR, function=enum(TIMEX_FUNCTIONS),
                                         anchor=STR)))

ABBREVIATION_RE = re.compile(r"\b[A-Z][A-Z0-9]+\b")
GERUND_RE = re.compile(r"\w+ndo(?:-(?:se|o|a|os|as|lhe|lhes))?$", re.I)
IMPERFECT_RE = re.compile(r"(?:ava|avam|ávamos)(?:-se)?$", re.I)
PERFECT_RE = re.compile(r"(?:ou|aram|eu|eram|iu|iram)(?:-se|-lhe)?$", re.I)
PARTICIPLE_RE = re.compile(r"(?:ad|id|it|ost|ert|eit)[oa]s?$", re.I)

# "Common verbs" per class in the Med2Story manual (General Event › Class), checked in this order
VERB_CLASS_LEXICON = [
    ("REPORTING", r"(referi|refere|relat|declar|diz|disse|explic|inform|mencion)"),
    ("PERCEPTION", r"(ouv|viu|ver$|vê|observou o doente)"),
    ("ASPECTUAL", r"(começ|inici|continu|termin|conclu|interromp)"),
    ("I_ACTION", r"(tent|adi[aoe]|evit|cancel|ped|solicit|orden|autoriz|promet|oferec|propo|propõ|propus|decid"
                 r"|concord|nome|suger|aleg)"),
    ("I_STATE", r"(acredit|pens|imagin|quer|esper|odi|preocup|exig)"),
    ("STATE", r"(mostr|revel|evidenci|apresent|encontr|mant)"),
]

NUMBER_WORDS = {"um": 1, "uma": 1, "dois": 2, "duas": 2, "três": 3, "tres": 3, "quatro": 4, "cinco": 5, "seis": 6,
                "sete": 7, "oito": 8, "nove": 9, "dez": 10, "onze": 11, "doze": 12, "quinze": 15, "vinte": 20,
                "trinta": 30}
UNIT_CODES = {"ano": "Y", "anos": "Y", "mes": "M", "meses": "M", "mês": "M", "semana": "W", "semanas": "W",
              "dia": "D", "dias": "D", "hora": "TH", "horas": "TH"}
DURATION_RE = re.compile(r"(\d+|[a-zçê]+)\s+(anos?|m[eê]s(?:es)?|semanas?|dias?|horas?)\b", re.I)


def set_answers(doc, answers, keys):
    """Copy the answered attributes onto the events ("NONE" -> None)."""
    events = {ev["id"]: ev for ev in doc["events"]}
    for a in answers:
        ev = events.get(a.get("id"))
        if ev is not None:
            ev.update({k: (None if a[k] == "NONE" else a[k]) for k in keys if k in a})


def events_per_sentence(doc, condition=lambda ev: True):
    groups = {}
    for ev in doc["events"]:
        if condition(ev):
            groups.setdefault((ev["report"], ev["sentence"]), []).append(ev)
    return groups


def event_list(events):
    return "\n".join(f'{ev["id"]}: «{ev["text"]}»' for ev in events)


# --- observations ----------------------------------------------------------------------------------------
def observations(doc, gemini):
    for ev in doc["events"]:
        ev["observations"] = None
    jobs = []
    for report in doc["reports"]:
        report_events = [ev for ev in doc["events"] if ev["report"] == report["index"]]
        here = [ev for ev in report_events if ev.get("domain") == "MEDICAL" and ABBREVIATION_RE.search(ev["text"])]
        if here:
            report_text = markup(doc, report["body_start"], report["end"], report_events)
            jobs += [(report_text, batch) for batch in batches(here)]

    def ask(job):
        report_text, batch = job
        prompt = fill("OBSERVATIONS", step="P1.1.13", path=f"{SPECIALIZED_PATH} › observations: abbreviations in full",
                      report=report_text,
                      events="\n".join(f'{ev["id"]}: «{ev["text"]}» (pos={ev.get("pos")})' for ev in batch))
        return (gemini.ask(prompt, OBSERVATIONS_SCHEMA, "observations") or {}).get("events", [])

    for answers in in_parallel(ask, jobs):
        set_answers(doc, answers, ["observations"])
    for ev in doc["events"]:  # keep only a real expansion
        text = (ev.get("observations") or "").strip()
        ev["observations"] = text if text and len(text) <= 80 and fold(text) != fold(ev["text"]) else None


# --- morphosyntactic information ---------------------------------------------------------------------------
def morphosyntax(doc, gemini):
    groups = events_per_sentence(doc)

    def ask(key):
        s, e = doc["reports"][key[0]]["sentences"][key[1]]
        events = {ev["id"]: ev for ev in groups[key]}

        def make_prompt(ids):
            return fill("MORPHOSYNTAX", sentence=markup(doc, s, e, list(events.values())),
                        events=event_list(events[i] for i in ids))

        return list(gemini.ask_each(make_prompt, list(events), MORPHOSYNTAX_SCHEMA, "morphosyntax",
                                    key="events").values())

    for answers in in_parallel(ask, list(groups)):
        set_answers(doc, answers, ["pos", "polarity", "tense", "aspect", "vform", "mood", "modality"])

    for ev in doc["events"]:
        ev.setdefault("pos", None)
        ev.setdefault("polarity", "POS")
        if ev["pos"] != "VERB":
            ev.update(vform=None, mood=None, modality=None)
            continue
        if GERUND_RE.search(ev["text"]):  # annotators: a gerund has no tense ("condicionando")
            ev["vform"] = "GERUNDIVE"
        if ev.get("vform") == "GERUNDIVE":
            ev["tense"] = None
        ev.update(domain="GENERAL", medical_class=None, personal_history=None)  # verbs are General Events


# --- semantic information (verbs) --------------------------------------------------------------------------
def verb_rules(ev):
    word = fold(ev["text"]).split()[-1]
    for event_class, pattern in VERB_CLASS_LEXICON:
        if re.match(pattern, word):
            ev["event_class"] = event_class
            break
    if ev.get("event_class") == "STATE":  # a state verb holds true -> type State
        ev["event_type"] = "STATE"
    if ev.get("vform") == "PARTICIPLE" and not PARTICIPLE_RE.search(word):
        ev["vform"] = None  # "inicia" is a finite verb, not a participle
    if ev.get("vform") is None and ev.get("tense") == "PAST" and IMPERFECT_RE.search(word):
        ev["aspect"] = "IMPERFECTIVE"  # "apresentava", "encontrava-se"
    elif ev.get("vform") is None and ev.get("tense") == "PAST" and PERFECT_RE.search(word):
        ev["aspect"] = "PERFECTIVE"  # "realizou", "revelaram"


def semantics(doc, gemini):
    groups = events_per_sentence(doc, lambda ev: ev.get("pos") == "VERB")

    def ask(key):
        s, e = doc["reports"][key[0]]["sentences"][key[1]]
        verbs = {ev["id"]: ev for ev in groups[key]}
        sentence_events = [ev for ev in doc["events"] if (ev["report"], ev["sentence"]) == key]

        def make_prompt(ids):
            return fill("SEMANTICS", sentence=markup(doc, s, e, sentence_events),
                        events=event_list(verbs[i] for i in ids))

        return list(gemini.ask_each(make_prompt, list(verbs), SEMANTICS_SCHEMA, "semantics", key="events").values())

    for answers in in_parallel(ask, list(groups)):
        set_answers(doc, answers, ["event_class", "event_type"])
    for ev in doc["events"]:
        if ev.get("pos") == "VERB":
            verb_rules(ev)


# --- value of the temporal expressions ---------------------------------------------------------------------
def duration_value(text):
    """'79 anos' -> 'P79Y', 'dez meses' -> 'P10M', '3 horas' -> 'PT3H' (None if not a simple duration)."""
    m = DURATION_RE.search(text)
    if not m:
        return None
    n = int(m.group(1)) if m.group(1).isdigit() else NUMBER_WORDS.get(m.group(1).lower())
    unit = UNIT_CODES.get(m.group(2).lower())
    if not n or not unit:
        return None
    return f"PT{n}H" if unit == "TH" else f"P{n}{unit}"


def timex_values(doc, gemini):
    jobs = []
    for report in doc["reports"]:
        here = [t for t in doc["timexes"] if not t.get("header") and t["report"] == report["index"]]
        if here:
            jobs.append((report, here, markup(doc, report["body_start"], report["end"], here)))

    def ask(job):
        report, timexes, report_text = job
        lines = "\n".join(f'{t["id"]}: «{t["text"]}» (type={t["timex_type"]})' for t in timexes)
        dct = next((t for t in doc["timexes"] if t.get("is_dct") and t["report"] == report["index"]), None)
        if dct:
            lines += f'\n{dct["id"]}: «{dct["text"]}» (DOCTIME, value={dct["value"]}; may be used as anchor)'
        prompt = fill("TIMEX_VALUE", dct=report["dct"]["value"] if report["dct"] else "unknown", report=report_text,
                      timexes=lines)
        return (gemini.ask(prompt, TIMEX_VALUE_SCHEMA, "timex_value") or {}).get("timexes", [])

    by = {t["id"]: t for t in doc["timexes"]}
    for answers in in_parallel(ask, jobs):
        for a in answers:
            t = by.get(a["id"])
            if t is None or t.get("header"):  # header dates were set from the text already
                continue
            t["value"] = a["value"].strip() or None
            t["function"] = None if a["function"] == "NONE" else a["function"]
            if t.get("timex_type") == "DURATION" and duration_value(t["text"]):
                t["value"] = duration_value(t["text"])
            anchor = by.get(a["anchor"].strip())
            if anchor and anchor is not t:
                t["anchor"] = anchor["id"]
                if not anchor["function"]:
                    anchor["function"] = "ANCHOR_TIME"  # the reference time of an anaphoric expression


def run(doc, gemini):
    observations(doc, gemini)
    morphosyntax(doc, gemini)
    semantics(doc, gemini)
    timex_values(doc, gemini)
