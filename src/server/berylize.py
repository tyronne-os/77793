"""Berylize identity: display name, persona text, and Modelfile export.

The served model (Qwen under the hood) is addressed as "Berylize <size>", where size is read from the
model id (Qwen2.5-Coder-14B-Instruct -> "Berylize 14B"). The persona in persona/berylize.md is the
single source of truth; `python berylize.py --modelfile` writes an Ollama-style Modelfile from it.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

PERSONA_FILE = Path(__file__).parent / "persona" / "berylize.md"
CREATIVES_NAME = "Berylize Creatives"   # was MiniMax H3; env/ports/API model ids keep legacy names


def display_name(model_id: str | None) -> str:
    """'Qwen/Qwen2.5-Coder-14B-Instruct' -> 'Berylize 14B'; unknown size -> 'Berylize'."""
    if not model_id:
        return "Berylize"
    mid = model_id.split(":", 1)[-1].split("/")[-1]
    m = re.search(r"(?<![\d.])(\d+(?:\.\d+)?)\s*[bB](?![a-zA-Z])", mid)
    return f"Berylize {m.group(1)}B" if m else "Berylize"


def base_name(model_id: str | None) -> str:
    return (model_id or "the served LLM").split(":", 1)[-1].split("/")[-1]


def persona(model_id: str | None = None) -> str:
    text = PERSONA_FILE.read_text()
    return text.replace("{name}", display_name(model_id)).replace("{base}", base_name(model_id)).strip()


def modelfile(base: str = "qwen2.5-coder:14b") -> str:
    """Ollama-style Modelfile so the persona is portable to any runtime that supports SYSTEM prompts."""
    body = persona(base).replace('"""', "'''")
    return (f'# Berylize Modelfile (generated from src/server/persona/berylize.md)\nFROM {base}\n'
            f'PARAMETER temperature 0.25\nPARAMETER num_ctx 16384\nSYSTEM """\n{body}\n"""\n')


if __name__ == "__main__":
    if "--modelfile" in sys.argv:
        out = Path(__file__).parents[2] / "models" / "Berylize.modelfile"
        out.parent.mkdir(exist_ok=True)
        out.write_text(modelfile())
        print(f"wrote {out}")
    else:
        print(persona(sys.argv[1] if len(sys.argv) > 1 else None))
