"""Talking to Gemini: one request = one prompt + the JSON format we expect back.

Every answer is requested as JSON that follows a JSON schema (Gemini's structured output). The answer is
checked against the schema, small spelling differences are repaired ("verb" -> "VERB"), and an invalid answer is
asked again. Answers can be stored in a cache file, so annotating the same text twice costs nothing.
"""
import hashlib
import json
import logging
import os
import re
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import jsonschema
from openai import OpenAI, BadRequestError

from . import config
from .prompts import PROMPTS

log = logging.getLogger("medtime")


# --- small helpers to write the JSON schemas of the answers ----------------------------------------------
def obj(**fields):
    """JSON object whose fields are all required."""
    return {"type": "object", "properties": fields, "required": list(fields), "additionalProperties": False}


def arr(items):
    return {"type": "array", "items": items}


def enum(values):
    return {"type": "string", "enum": list(values)}


STR = {"type": "string"}

# Spellings that models use instead of our labels.
SYNONYMS = {"ADJ": "ADJECTIVE", "ADP": "PREPOSITION", "PREP": "PREPOSITION", "PRON": "PRONOUN",
            "PROPN": "NOUN", "NUM": "NOUN", "NUMERAL": "NOUN", "ADVERB": "ADJECTIVE", "POSITIVE": "POS",
            "NEGATIVE": "NEG", "INDICATIVE": "NONE", "FINITE": "NONE", "N/A": "NONE", "NULL": "NONE", "": "NONE"}


def repair(data, schema):
    """Fit a parsed answer to its schema instead of rejecting it.

    Label spellings are normalised ("I-action" -> "I_ACTION"), a missing text field becomes "", a missing
    label becomes "NONE" when that is allowed, and only list items that stay invalid are dropped.
    """
    if schema.get("type") == "object" and isinstance(data, dict):
        fixed = {}
        for key, sub in schema["properties"].items():
            if key in data:
                fixed[key] = repair(data[key], sub)
            elif sub.get("type") == "string" and "enum" not in sub:
                fixed[key] = ""
            elif "NONE" in sub.get("enum", []):
                fixed[key] = "NONE"
            else:
                raise ValueError(f"missing field {key}")
        return fixed
    if schema.get("type") == "array" and isinstance(data, list):
        kept = []
        for item in data:
            try:
                kept.append(repair(item, schema["items"]))
            except (ValueError, TypeError):
                pass
        return kept
    if "enum" in schema:
        value = re.sub(r"[\s-]+", "_", str(data).strip()).upper()
        value = SYNONYMS.get(value, value)
        if value not in schema["enum"]:
            raise ValueError(f"{data!r} not in {schema['enum']}")
        return value
    if schema.get("type") == "string":
        return "" if data is None else str(data)
    return data


def parse_json(text):
    """The JSON object inside an answer. A cut-off list keeps its complete items."""
    text = re.sub(r"```(?:json)?", "", text or "")
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < start:
        raise ValueError("no JSON object in the answer")
    try:
        return json.loads(text[start:end + 1])
    except json.JSONDecodeError:
        cut = text.rfind("},", start)
        while cut > start:
            try:
                return json.loads(text[start:cut + 1] + "]}")
            except json.JSONDecodeError:
                cut = text.rfind("},", start, cut)
        raise


class Gemini:
    """Gemini client. `ask(prompt, schema, name)` returns the answer as a dict, or None if it failed."""

    def __init__(self, api_key=None, model=config.GEMINI_MODEL, cache_file=None):
        api_key = api_key or os.environ.get(config.API_KEY_ENV)
        if not api_key:
            raise RuntimeError(f"No Gemini API key: set the environment variable {config.API_KEY_ENV}")
        self.model = model
        self.client = OpenAI(base_url=config.GEMINI_BASE_URL, api_key=api_key,
                             timeout=config.REQUEST_TIMEOUT, max_retries=config.HTTP_RETRIES)
        logging.getLogger("httpx").setLevel(logging.WARNING)
        self.system = PROMPTS["SYSTEM"]
        self.use_schema = True
        self.lock = threading.Lock()
        self.stats = dict(requests=0, cached=0, failed=0, prompt_tokens=0, answer_tokens=0)

        # cache: one JSON line per answer, {"key": hash of the request, "value": answer}
        self.cache, self.cache_file = {}, Path(cache_file) if cache_file else None
        if self.cache_file and self.cache_file.exists():
            for line in self.cache_file.read_text(encoding="utf-8").splitlines():
                record = json.loads(line)
                self.cache[record["key"]] = record["value"]

    def _send(self, prompt, schema, name):
        """One request. Returns (answer text, True if the answer was cut by the token limit)."""
        request = dict(model=self.model, temperature=config.TEMPERATURE,
                       max_tokens=config.MAX_TOKENS.get(name, config.DEFAULT_MAX_TOKENS),
                       reasoning_effort=config.REASONING_EFFORT,
                       messages=[{"role": "system", "content": self.system}, {"role": "user", "content": prompt}])
        if self.use_schema:
            request["response_format"] = {"type": "json_schema",
                                          "json_schema": {"name": name, "schema": schema, "strict": True}}
        try:
            response = self.client.chat.completions.create(**request)
        except BadRequestError as error:
            if not self.use_schema:
                raise
            log.warning("structured output rejected (%s), continuing with plain JSON", error)
            self.use_schema = False
            request.pop("response_format")
            response = self.client.chat.completions.create(**request)
        if response.usage:
            with self.lock:
                self.stats["prompt_tokens"] += response.usage.prompt_tokens or 0
                self.stats["answer_tokens"] += response.usage.completion_tokens or 0
        choice = response.choices[0]
        return choice.message.content, choice.finish_reason == "length"

    def ask(self, prompt, schema, name):
        key = hashlib.sha256(json.dumps([self.model, self.system, prompt, schema], ensure_ascii=False)
                             .encode()).hexdigest()
        if key in self.cache:
            with self.lock:
                self.stats["cached"] += 1
            return self.cache[key]

        answer, error, question = None, None, prompt
        for _ in range(config.MAX_ATTEMPTS):
            with self.lock:
                self.stats["requests"] += 1
            try:
                text, cut_off = self._send(question, schema, name)
                try:
                    answer = repair(parse_json(text), schema)
                    jsonschema.validate(answer, schema)
                    break
                except Exception:
                    if cut_off:  # runaway answer: asking again at temperature 0 would only repeat it
                        log.warning("prompt '%s': answer hit the token limit and was discarded", name)
                        answer = None
                        break
                    raise
            except Exception as e:  # invalid JSON, schema violation or a server error: ask again
                error, answer = e, None
                question = (prompt + f"\n\nYour previous answer was invalid ({str(e)[:300]}). "
                            "Answer again with ONLY valid JSON in the required format.")
        if answer is None:
            with self.lock:
                self.stats["failed"] += 1
            log.warning("prompt '%s' failed: %s", name, error)
            return None

        with self.lock:
            self.cache[key] = answer
            if self.cache_file:
                self.cache_file.parent.mkdir(parents=True, exist_ok=True)
                with self.cache_file.open("a", encoding="utf-8") as f:
                    f.write(json.dumps({"key": key, "value": answer}, ensure_ascii=False) + "\n")
        return answer

    def ask_each(self, make_prompt, ids, schema, name, key="items"):
        """Ask about a list of candidate IDs and expect one answer per ID.

        `make_prompt(ids)` builds the prompt for the given IDs. IDs that Gemini skipped are asked once more.
        Returns {id: answer item}.
        """
        out = self.ask(make_prompt(ids), schema, name)
        answers = {a["id"]: a for a in (out or {}).get(key, []) if a["id"] in ids}
        missing = [i for i in ids if i not in answers]
        if missing and out is not None:
            out = self.ask(make_prompt(missing) + "\n\nIMPORTANT: give one entry for EVERY ID listed above.",
                           schema, name)
            answers.update({a["id"]: a for a in (out or {}).get(key, []) if a["id"] in missing})
        return answers


def in_parallel(function, items):
    """[function(x) for x in items], with the requests running in parallel. The order is kept."""
    with ThreadPoolExecutor(config.MAX_PARALLEL_REQUESTS) as pool:
        return list(pool.map(function, items))
