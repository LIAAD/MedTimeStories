"""Read the prompt texts from the prompts/ folder and fill in their <<placeholders>>.

The prompts live in 4 plain text files, one per annotation layer, so they can be read and edited without
touching the code:

    prompts/1_detection.txt  2_classification.txt  3_attributes.txt  4_links.txt

Inside a file, every prompt starts with a line "===== NAME =====" and lines starting with "#" are comments.
"""
import re
from pathlib import Path

PROMPT_DIR = Path(__file__).resolve().parent.parent / "prompts"
PROMPT_FILES = ["1_detection.txt", "2_classification.txt", "3_attributes.txt", "4_links.txt"]

HEADER_RE = re.compile(r"^===== (.+?) =====$")
PLACEHOLDER_RE = re.compile(r"<<(\w+)>>")


def load_prompts(folder=PROMPT_DIR):
    """Return {prompt name: prompt text} for all prompts of the 4 files."""
    prompts = {}
    for file_name in PROMPT_FILES:
        name, lines = None, []
        for line in (Path(folder) / file_name).read_text(encoding="utf-8").split("\n"):
            if line.startswith("#"):
                continue
            header = HEADER_RE.match(line)
            if header:
                if name:
                    prompts[name] = "\n".join(lines).strip("\n")
                name, lines = header.group(1), []
            elif name:
                lines.append(line)
        if name:
            prompts[name] = "\n".join(lines).strip("\n")
    return prompts


PROMPTS = load_prompts()


def fill(name, **values):
    """Prompt `name` with every <<key>> replaced by values[key]. A missing value is an error, on purpose."""
    def replace(match):
        key = match.group(1)
        if key not in values:
            raise KeyError(f"prompt {name}: no value given for <<{key}>>")
        return str(values[key])

    return PLACEHOLDER_RE.sub(replace, PROMPTS[name])
