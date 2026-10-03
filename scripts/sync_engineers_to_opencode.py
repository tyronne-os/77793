#!/usr/bin/env python3
"""Export CRANE's engineer roles to OpenCode as subagents (single source of truth: src/server/engineers.py)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src" / "server"))
import engineers

out = Path.home() / ".config" / "opencode" / "agent"
out.mkdir(parents=True, exist_ok=True)
for role in engineers.ROLES:
    (out / f"{role}.md").write_text(engineers.opencode_markdown(role))
    print("wrote", out / f"{role}.md")
