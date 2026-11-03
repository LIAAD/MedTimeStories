# MedTimeStories annotator (Gemini)

This annotates Portuguese clinical reports with the **Med2Story** temporal annotation scheme and writes the result as an **INCEpTION** document. The demo can then draw the patient timeline from that file.

```
 input text (.txt)  ──►  Gemini 2.5 Flash, 4 prompting layers  ──►  INCEpTION file (UIMA CAS JSON)  ──►  demo / visualisation
                          1 detection → 2 classification
                          → 3 attributes → 4 temporal links
```

The output has the same layers and value spellings as the human annotations in our INCEpTION project. So the demo can read an automatic annotation exactly like a gold one.

## Quick start

```bash
pip install -r requirements.txt            # openai, dkpro-cassis, jsonschema (tested with Python 3.10)
export GEMINI_API_KEY=...                  # Gemini API key

python annotate.py report.txt              # -> output/report.json
python annotate.py my_reports/ --out out   # every .txt file of a folder
python annotate.py report.txt --xmi        # also UIMA CAS XMI + TypeSystem.xml
python annotate.py report.txt --cache answers.jsonl   # re-running the same text costs no API calls
```

One `.txt` file is **one patient**, and it may hold several consecutive reports. A report starts with a line `Serviço executante:` (consultation report) or `Clínica :` (discharge summary). The header dates (`Data de registo`, `Data Alta Clínica`, `Data Admissão`) are recognised automatically.

## Use it from Python (live demo)

```python
import sys; sys.path.insert(0, "path/to/this/folder")
from medtime import Gemini, annotate_text, to_inception_json

gemini = Gemini(cache_file="answers.jsonl")   # key from GEMINI_API_KEY (or Gemini(api_key="..."))
doc = annotate_text(report_text, "patient_42", gemini)
cas_json = to_inception_json(doc)             # a string, identical in format to an INCEpTION export
```

`doc` is also a plain dict, if you prefer to skip the INCEpTION format. It has `doc["events"]`, `doc["timexes"]` and `doc["tlinks"]`, with character offsets into the input text (see [medtime/document.py](medtime/document.py)).

## The output file

UIMA CAS JSON, the format of *INCEpTION → Export → UIMA CAS JSON*. Read it with [dkpro-cassis](https://github.com/dkpro/dkpro-cassis):

```python
from cassis import load_cas_from_json
cas = load_cas_from_json(open("output/report.json", "rb"))
text = cas.sofa_string
for span in cas.select("custom.Span"):
    print(span.begin, span.end, span.get_covered_text(), span.label, span.SpecializedEventClass, span.Value)
for link in cas.select("custom.Relation"):
    print(link.Governor.get_covered_text(), link.temporal_links, link.Dependent.get_covered_text())
```

| Layer | Feature | Values |
|---|---|---|
| `custom.Span` | `label` | `General Event`, `Specialized Event`, `Time` |
| events | `SpecializedEventClass` | `Sign or Symptom`, `Personal History`, `Intercurrence`, `Examination`, `Examination Result`, `Principal Diagnosis`, `Characterization of the Disease`, `Medical Procedure`, `Treatment`, `Drug Administration Route`, `Treatment Response` |
| | `PersonalHistory` | `Past Medical History`, `Comorbidity`, `Undefined` |
| | `Pos` / `Polarity` | `Noun`, `Verb`, `Adjective`, `Pronoun`, `Other` / `Pos`, `Neg` |
| | `Class` / `Event_Type` | `Occurrence`, `State`, `Reporting`, `Perception`, `Aspectual`, `I_Action`, `I_State` / `State`, `Process`, `Transition` |
| | `Tense`, `Aspect`, `VForm`, `Mood`, `Modality` | e.g. `Past`, `Perfective`, `Participle`, `Subjunctive`, `Poder` |
| | `Observations` | full form of an abbreviation (`LDH` → `lactato desidrogenase`) |
| temporal expressions | `Time_Type` | `Date`, `Time`, `Duration`, `Set` |
| | `Value` | ISO-TimeML value: `2019-05-15`, `2018-12`, `P79Y`, `PAST_REF`, ... |
| | `TemporalFunction` | `DOCTIME`, `AdmissionTime`, `DischargeTime`, `AnchorTime` |
| `custom.Relation` | `Governor` → `Dependent` | read as *Governor relation Dependent*: `assintomática TLINK_isIncluded dezembro de 2018` |
| | `temporal_links` | `TLINK_before`, `TLINK_after`, `TLINK_before_overlap`, `TLINK_overlap_after`, `TLINK_includes`, `TLINK_isIncluded`, `TLINK_during`, `TLINK_simultaneous`, `TLINK_identity`, `TLINK_begins`, `TLINK_ends`, `TLINK_begunBy`, `TLINK_endedBy` |

Empty features are left out, as INCEpTION does. The file also has `Sentence`, `Token` and `DocumentMetaData`. To correct an annotation by hand, import the file into the MedTimeStories INCEpTION project as *UIMA CAS JSON*. Its type system is [typesystem/TypeSystem.xml](typesystem/TypeSystem.xml).

## How it works: the 4 layers

All prompts are plain text files in [prompts/](prompts/), one file per layer. Each prompt starts with a line `===== NAME =====`. `<<name>>` marks the parts the code fills in, and `#` lines are comments. You can change a prompt there without touching the code.

| Layer | Prompt file | Code | What it does |
|---|---|---|---|
| 1 | [1_detection.txt](prompts/1_detection.txt) | [step1_detection.py](medtime/step1_detection.py) | Sentence by sentence: lists the events, then asks again for missing ones, then verifies every candidate (keep / drop / fix the span) and removes participants (anatomy, drugs, people, values). Temporal expressions are found the same way. Header dates are taken straight from the text. |
| 2 | [2_classification.txt](prompts/2_classification.txt) | [step2_classification.py](medtime/step2_classification.py) | Walks down the Med2Story tree as yes/no questions: *specialized event?* → medical class in Decision Tree 1 order → Personal History attribute. Also gives the type of each temporal expression (Date / Time / Duration / Set). |
| 3 | [3_attributes.txt](prompts/3_attributes.txt) | [step3_attributes.py](medtime/step3_attributes.py) | Event attributes (PoS, tense, aspect, class, type, polarity, ...), abbreviations written in full, and the ISO value of each temporal expression (resolved against the report date). |
| 4 | [4_links.txt](prompts/4_links.txt) | [step4_links.py](medtime/step4_links.py) | Finds which pairs are temporally linked (within a sentence and with the previous sentence). The code fixes the direction, then the relation is chosen with one yes/no question per relation type. Links between consecutive reports are added too. |

Two design choices make it work better than a single big prompt:

- **Gemini returns text, the code finds the offsets.** Gemini answers with the words of an annotation ("dor pélvica"). [spans.py](medtime/spans.py) finds those words in the sentence and cuts them to the span rules of the manual (no determiners, no prepositions).
- **Small questions, then rules.** Each prompt asks about one node of the scheme only. Afterwards, a few deterministic rules from the manual and the annotators' feedback are applied, for example: a verb is never a medical event, a gerund has no tense, and `79 anos` → `P79Y`. Each rule is commented in the code.

## Code map

```
annotate.py                  command line: .txt files in, INCEpTION files out
prompts/                     the 4 prompt files (one per layer)
typesystem/TypeSystem.xml    INCEpTION type system of the MedTimeStories project
medtime/
  config.py                  every setting (model, parallel requests, batch size, token limits)
  gemini.py                  Gemini client: JSON-schema answers, checks, retries, cache
  prompts.py                 reads the prompt files and fills in <<placeholders>>
  document.py                text → reports, header dates, sentences, tokens
  spans.py                   Gemini's text → character offsets; ⟦E3 text⟧ mark-up for the next prompts
  step1_detection.py … step4_links.py     the 4 layers
  inception.py               document → UIMA CAS JSON / XMI
  pipeline.py                annotate_text(), annotate_file(), to_inception_json()
```

## Good to know

- **The text is sent to Google.** Only use reports you are allowed to process with the Gemini API. The MedTimeStories corpus is approved for public release.
- **Cost and speed.** Annotating one patient takes a few hundred Gemini requests: 420 on average for our 5 evaluation patients. The requests run 8 in parallel (`MAX_PARALLEL_REQUESTS` in [config.py](medtime/config.py)). For a live demo, keep `--cache` / `cache_file` on, so that a text annotated before comes back immediately.
- **Quality.** Scores against the human annotations of 5 patients (paper, Gemini 2.5 Flash):

  | | F1 |
  |---|---|
  | Events (overlapping span) | 89.9 |
  | Temporal expressions | 78.1 |
  | Specialized events, with the correct medical class | 57.1 |
  | TLINK pairs | 42.9 |
  | TLINK pairs, with the correct relation | 13.9 |

  Temporal relations are the weakest part: expect many links typed `TLINK_simultaneous` or `TLINK_during`.
- **Reproducible.** Temperature 0 and thinking off. Running the same text again gives the same or a very similar annotation.
