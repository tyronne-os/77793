#!/usr/bin/env python3
"""Headless Multi-Suite scenario runner (no browser).
Usage: .venv/bin/python scripts/run_scenario.py tests/scenarios/head_to_head.json [--pipeline NAME]
--pipeline forces every seat onto one pipeline (shared-cluster run). Prints a leaderboard and the saved run path."""
import asyncio, json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src" / "server"))
import multiavatar


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        print(__doc__); return 2
    scenario = json.loads(Path(args[0]).read_text())
    if "--pipeline" in sys.argv:
        forced = sys.argv[sys.argv.index("--pipeline") + 1]
        for s in scenario["seats"]:
            s["pipeline"] = forced
    rec = asyncio.run(multiavatar.run_headless(scenario))
    print(f"run {rec['id']}  mode={rec['mode']}  turns={len(rec['turns'])}" + ("  [LOOP GUARD TRIPPED]" if rec.get("guard_tripped") else ""))
    print(f"{'suite':12} {'pipeline':10} {'turns':>5} {'ttft_ms':>8} {'tok/s':>7} {'words':>6} {'repeat':>7}")
    for r in rec["summary"].values():
        print(f"{r['name']:12} {r['pipeline']:10} {r['turns']:>5} {r['avg_ttft_ms']:>8.0f} {r['avg_tps']:>7.1f} {r['avg_words']:>6.1f} {r['avg_repetition']:>7.0%}")
    print("saved:", multiavatar._runs_dir() / f"{rec['id']}.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
