"""Write the annotation as an INCEpTION document (UIMA CAS JSON, or XMI).

The layers and value spellings are the ones of the MedTimeStories INCEpTION project (the human gold exports),
so the file can be imported in that project and read by the demo like a human annotation:

    custom.Span       label = "General Event" | "Specialized Event" | "Time"
                      events: SpecializedEventClass, PersonalHistory, Pos, Polarity, Class, Event_Type, Tense,
                              Aspect, VForm, Mood, Modality, Observations
                      temporal expressions: Time_Type, Value, TemporalFunction
    custom.Relation   Governor = source span, Dependent = target span, temporal_links = "TLINK_isIncluded", ...
                      (read as: Governor <relation> Dependent)
    + Sentence, Token and DocumentMetaData, as in every INCEpTION export.

The type system (typesystem/TypeSystem.xml) is the one of that project.
"""
from pathlib import Path

from cassis import Cas, load_typesystem

TYPESYSTEM_FILE = Path(__file__).resolve().parent.parent / "typesystem" / "TypeSystem.xml"

SPAN = "custom.Span"
RELATION = "custom.Relation"
SENTENCE = "de.tudarmstadt.ukp.dkpro.core.api.segmentation.type.Sentence"
TOKEN = "de.tudarmstadt.ukp.dkpro.core.api.segmentation.type.Token"
METADATA = "de.tudarmstadt.ukp.dkpro.core.api.metadata.type.DocumentMetaData"

# our label -> value written in INCEpTION
MEDICAL_CLASS = {"SIGN_OR_SYMPTOM": "Sign or Symptom", "PERSONAL_HISTORY": "Personal History",
                 "INTERCURRENCE": "Intercurrence", "EXAMINATION": "Examination",
                 "EXAMINATION_RESULT": "Examination Result", "PRINCIPAL_DIAGNOSIS": "Principal Diagnosis",
                 "CHARACTERIZATION_OF_THE_DISEASE": "Characterization of the Disease",
                 "MEDICAL_PROCEDURE": "Medical Procedure", "TREATMENT": "Treatment",
                 "DRUG_ADMINISTRATION_ROUTE": "Drug Administration Route", "TREATMENT_RESPONSE": "Treatment Response"}
PERSONAL_HISTORY = {"PAST_MEDICAL_HISTORY": "Past Medical History", "COMORBIDITY": "Comorbidity",
                    "UNDEFINED": "Undefined"}
POS = {"VERB": "Verb", "NOUN": "Noun", "ADJECTIVE": "Adjective", "PRONOUN": "Pronoun",
       "PREPOSITION": "Other"}  # the project's PoS tag set has no Preposition ("em observação" is rare)
POLARITY = {"POS": "Pos", "NEG": "Neg"}
EVENT_CLASS = {"OCCURRENCE": "Occurrence", "STATE": "State", "REPORTING": "Reporting", "PERCEPTION": "Perception",
               "ASPECTUAL": "Aspectual", "I_ACTION": "I_Action", "I_STATE": "I_State"}
EVENT_TYPE = {"STATE": "State", "PROCESS": "Process", "TRANSITION": "Transition"}
TENSE = {"PRESENT": "Present", "PAST": "Past", "FUTURE": "Future"}
ASPECT = {"PROGRESSIVE": "Progressive", "PERFECTIVE": "Perfective", "IMPERFECTIVE": "Imperfective",
          "PERFECTIVE_PROGRESSIVE": "Perfective_Progressive", "IMPERFECTIVE_PROGRESSIVE": "Imperfective_Progressive"}
VFORM = {"GERUNDIVE": "Gerundive", "INFINITIVE": "Infinitive", "PARTICIPLE": "Participle"}
MOOD = {"SUBJUNCTIVE": "Subjunctive", "CONDITIONAL": "Conditional", "FUTURE": "Future"}
MODALITY = {"DEVER": "Dever", "PODER": "Poder", "TER_DE": "Ter_de", "SER_CAPAZ_DE": "Ser_capaz_de"}
TIMEX_TYPE = {"DATE": "Date", "TIME": "Time", "DURATION": "Duration", "SET": "Set"}
FUNCTION = {"DOCTIME": "DOCTIME", "ADMISSION_TIME": "AdmissionTime", "DISCHARGE_TIME": "DischargeTime",
            "ANCHOR_TIME": "AnchorTime"}
TLINK = {"BEFORE": "TLINK_before", "AFTER": "TLINK_after", "BEFORE_OVERLAP": "TLINK_before_overlap",
         "AFTER_OVERLAP": "TLINK_overlap_after", "INCLUDES": "TLINK_includes", "IS_INCLUDED": "TLINK_isIncluded",
         "DURING": "TLINK_during", "SIMULTANEOUS": "TLINK_simultaneous", "IDENTITY": "TLINK_identity",
         "BEGINS": "TLINK_begins", "ENDS": "TLINK_ends", "BEGUN_BY": "TLINK_begunBy", "ENDED_BY": "TLINK_endedBy"}

# INCEpTION feature -> (key in our event dict, value table)
EVENT_FEATURES = {"SpecializedEventClass": ("medical_class", MEDICAL_CLASS),
                  "PersonalHistory": ("personal_history", PERSONAL_HISTORY),
                  "Pos": ("pos", POS), "Polarity": ("polarity", POLARITY), "Class": ("event_class", EVENT_CLASS),
                  "Event_Type": ("event_type", EVENT_TYPE), "Tense": ("tense", TENSE), "Aspect": ("aspect", ASPECT),
                  "VForm": ("vform", VFORM), "Mood": ("mood", MOOD), "Modality": ("modality", MODALITY)}


def span_features(x):
    """INCEpTION features of one event or temporal expression (empty values are left out, as INCEpTION does)."""
    if x["kind"] == "TIMEX3":
        features = dict(label="Time", Time_Type=TIMEX_TYPE.get(x.get("timex_type")), Value=x.get("value"),
                        TemporalFunction=FUNCTION.get(x.get("function")))
    else:
        features = dict(label="Specialized Event" if x.get("domain") == "MEDICAL" else "General Event",
                        Observations=x.get("observations"))
        for feature, (key, table) in EVENT_FEATURES.items():
            features[feature] = table.get(x.get(key))
    return {k: v for k, v in features.items() if v}


def header_lines(doc, report):
    """The header lines of a report (Serviço executante / Data de registo ...) as extra sentences."""
    text, lines, position = doc["text"], [], report["start"]
    while position < report["body_start"]:
        newline = text.find("\n", position, report["body_start"])
        newline = report["body_start"] if newline < 0 else newline
        if text[position:newline].strip():
            lines.append((position, newline))
        position = newline + 1
    return lines


def to_cas(doc):
    with open(TYPESYSTEM_FILE, "rb") as f:
        typesystem = load_typesystem(f)
    cas = Cas(typesystem=typesystem, sofa_string=doc["text"], sofa_mime="text")
    Span, Relation = typesystem.get_type(SPAN), typesystem.get_type(RELATION)
    Sentence, Token = typesystem.get_type(SENTENCE), typesystem.get_type(TOKEN)

    cas.add(typesystem.get_type(METADATA)(begin=0, end=len(doc["text"]), language="x-unspecified",
                                          documentTitle=f"{doc['doc_id']}.txt", documentId=doc["doc_id"],
                                          documentUri=f"{doc['doc_id']}.txt", isLastSegment=False))
    for report in doc["reports"]:
        for begin, end in header_lines(doc, report) + report["sentences"]:
            cas.add(Sentence(begin=begin, end=end))
    for begin, end in doc["tokens"]:
        cas.add(Token(begin=begin, end=end, order=0))

    spans = {}
    for x in sorted(doc["events"] + doc["timexes"], key=lambda x: (x["start"], x["end"])):
        spans[x["id"]] = Span(begin=x["start"], end=x["end"], **span_features(x))
        cas.add(spans[x["id"]])
    for link in doc["tlinks"]:
        governor, dependent = spans[link["source"]], spans[link["target"]]
        # INCEpTION places a relation on the span of its Dependent (target)
        cas.add(Relation(begin=dependent.begin, end=dependent.end, Governor=governor, Dependent=dependent,
                         temporal_links=TLINK[link["relation"]]))
    return cas


def write(doc, out_dir, formats=("json",)):
    """Write <out_dir>/<doc_id>.json (UIMA CAS JSON) and/or .xmi (+ TypeSystem.xml). Returns the written paths."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    cas, written = to_cas(doc), []
    if "json" in formats:
        path = out_dir / f"{doc['doc_id']}.json"
        cas.to_json(path, pretty_print=True)
        written.append(path)
    if "xmi" in formats:
        path = out_dir / f"{doc['doc_id']}.xmi"
        cas.to_xmi(path, pretty_print=True)
        (out_dir / "TypeSystem.xml").write_bytes(TYPESYSTEM_FILE.read_bytes())
        written.append(path)
    return written
