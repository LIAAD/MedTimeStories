"""Turn the input text into a document: reports, header dates, sentences and tokens.

One input text is one patient. It can hold several consecutive reports; a report starts with a line
"Serviço executante:" (consultation report) or "Clínica :" (discharge summary). All reports stay in one document,
so that links between reports are possible.

The document is a plain dict, filled step by step by the 4 layers:

    doc["text"]      the input text, never changed (all offsets point into it)
    doc["reports"]   per report: start, end, body_start, sentences [(start, end)], header dates, dct
    doc["tokens"]    [(start, end)] of every word / number / punctuation mark
    doc["events"]    events   {"id": "E1", "start", "end", "text", "report", "sentence", attributes...}
    doc["timexes"]   temporal expressions {"id": "T1", ..., "timex_type", "value", "function"}
    doc["tlinks"]    temporal links {"id": "L1", "source": "E3", "target": "T1", "relation": "IS_INCLUDED"}
"""
import re
import unicodedata


def fold(s):
    """Lower case without accents ("Clínica" -> "clinica"). The length stays the same, so offsets stay valid."""
    return "".join(unicodedata.normalize("NFD", c.lower()[:1] or c)[0] for c in s)


REPORT_START_RE = re.compile(r"^[ \t]*(Serviço executante:|Cl[ií]nica\s*:)", re.M | re.I)
HEADER_LINE_RE = re.compile(r"^\s*(Serviço executante:.*|Data de registo:.*|Cl[ií]nica\s*:.*|Data Alta Cl[ií]nica:.*|"
                            r"Data Admiss[ãa]o:.*)$", re.I)

# Header dates. "Data de registo" is the date the report was written (DOCTIME); discharge summaries have the
# discharge and admission dates instead.
HEADER_DATE_RE = re.compile(r"(Data de registo|Data Alta Cl[ií]nica|Data Admiss[ãa]o):\s*"
                            r"(\d{1,2})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{4})", re.I)
HEADER_FUNCTION = {"data de registo": "DOCTIME", "data alta clinica": "DISCHARGE_TIME",
                   "data admissao": "ADMISSION_TIME"}

# A date standing alone at the very end of a report is the date it was signed: also a DOCTIME.
SIGNATURE_DATE_RE = re.compile(r"(?:(\d{1,2})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{4})|(\d{1,2})\s+de\s+([a-zçã]+)\s+de\s+"
                               r"(\d{4}))\s*$", re.I)
MONTHS = {"janeiro": 1, "fevereiro": 2, "marco": 3, "abril": 4, "maio": 5, "junho": 6, "julho": 7, "agosto": 8,
          "setembro": 9, "outubro": 10, "novembro": 11, "dezembro": 12}

TOKEN_RE = re.compile(r"\d+(?:[.,/:-]\d+)*%?|\w+(?:[-'’]\w+)*|[^\w\s]")
ABBREVIATIONS = {"dr", "dra", "sr", "sra", "n", "nº", "ex", "fig", "aprox", "vs", "etc", "prof", "drª"}


def split_sentences(text, start, end):
    """Rule-based sentence splitter for clinical Portuguese (dates like 5.9.2013 and "Dr." do not split)."""
    sentences, s = [], start
    for m in re.finditer(r"[.!?]+(?=\s+[A-ZÀ-Ý0-9«\"(])|\n\s*\n", text[start:end]):
        b = start + m.end()
        previous_word = re.findall(r"(\w+)\W*$", text[s:start + m.start()] or " ")
        if m.group().strip() and previous_word and previous_word[0].lower() in ABBREVIATIONS:
            continue
        sentences.append((s, b))
        s = b
    sentences.append((s, end))

    stripped = []
    for a, b in sentences:
        while a < b and text[a].isspace():
            a += 1
        while b > a and text[b - 1].isspace():
            b -= 1
        if a < b:
            stripped.append((a, b))
    return stripped


def iso_date(day, month, year):
    return f"{year}-{int(month):02d}-{int(day):02d}"


def header_dates(text, report_start, body_start, report_end):
    """Dates of the report header (+ the signature date at the end), with their function in the document."""
    dates = []
    for m in HEADER_DATE_RE.finditer(text, report_start, body_start):
        dates.append(dict(start=m.start(2), end=m.end(4), value=iso_date(m.group(2), m.group(3), m.group(4)),
                          function=HEADER_FUNCTION[fold(m.group(1))]))
    m = SIGNATURE_DATE_RE.search(text, body_start, report_end)
    if m and (m.group(3) or MONTHS.get(fold(m.group(5) or ""))):
        if m.group(3):
            value = iso_date(m.group(1), m.group(2), m.group(3))
        else:
            value = iso_date(m.group(4), MONTHS[fold(m.group(5))], m.group(6))
        dates.append(dict(start=m.start(), end=m.start() + len(text[m.start():m.end()].rstrip()),
                          value=value, function="DOCTIME"))
    return dates


def load_document(text, doc_id="document"):
    starts = [m.start(1) for m in REPORT_START_RE.finditer(text)] or [0]
    starts[0] = 0  # anything before the first header belongs to the first report
    reports = []
    for i, start in enumerate(starts):
        end = starts[i + 1] if i + 1 < len(starts) else len(text)

        # the body starts after the header lines (Serviço executante / Data de registo / ...)
        body_start = start
        while body_start < end:
            newline = text.find("\n", body_start, end)
            line_end = end if newline < 0 else newline
            if text[body_start:line_end].strip() and not HEADER_LINE_RE.match(text[body_start:line_end]):
                break
            body_start = line_end + 1

        dates = header_dates(text, start, body_start, end)
        # the reference date of the report: Data de registo, else the discharge date
        dct = next((d for d in dates if d["function"] == "DOCTIME"), None) or \
            next((d for d in dates if d["function"] == "DISCHARGE_TIME"), None)
        reports.append(dict(index=i, start=start, end=end, body_start=body_start, header_dates=dates, dct=dct,
                            sentences=split_sentences(text, body_start, end)))

    return dict(doc_id=doc_id, text=text, reports=reports,
                tokens=[(m.start(), m.end()) for m in TOKEN_RE.finditer(text)],
                events=[], timexes=[], tlinks=[])
