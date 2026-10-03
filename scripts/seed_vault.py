#!/usr/bin/env python3
"""Seed the CRANE Second Brain Obsidian vault (knowledge/).

One-time generator: writes papers/, repos/, concepts/, playbooks/, MOC/, persona/ notes and the
.obsidian config. Existing files are NOT overwritten unless --force, so hand edits survive.

    python scripts/seed_vault.py [--force]
"""
from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from vault_data import HONORABLE, PAPERS, REPOS          # noqa: E402
from vault_notes import CONCEPTS, PLAYBOOKS              # noqa: E402

VAULT = Path(__file__).resolve().parents[1] / "knowledge"
FORCE = "--force" in sys.argv
DATE = "2026-10-02"
written: list[str] = []


def write(rel: str, text: str) -> None:
    p = VAULT / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    if p.exists() and not FORCE:
        return
    p.write_text(text.strip() + "\n")
    written.append(rel)


def fm(**kw) -> str:
    out = ["---"]
    for k, v in kw.items():
        out.append(f"{k}: [{', '.join(v)}]" if isinstance(v, list) else f"{k}: {v}")
    out.append("---")
    return "\n".join(out) + "\n"


def paper_title(p) -> str:
    return f"{p[1]} - {p[0]}"


# ---- reverse index: concept -> papers/repos that mention it ------------------------------
by_concept: dict[str, list[str]] = defaultdict(list)
for p in PAPERS:
    for c in p[6]:
        by_concept[c].append(f"[[{paper_title(p)}]]")

# ---- papers ------------------------------------------------------------------------------
for p in PAPERS:
    pid, short, title, pub, up, what, concepts, group, fit = p
    body = (
        fm(type="paper", arxiv=f'"{pid}"', published=pub, hf_upvotes=up, group=f'"{group}"',
           tags=["paper", "avatar"] + [g.lower().replace(" ", "-") for g in [group]], source="huggingface-papers", retrieved=DATE)
        + f"# {short} ({pid})\n\n**{title}**\n\n"
        f"- arXiv: https://arxiv.org/abs/{pid}\n- Hugging Face: https://huggingface.co/papers/{pid}\n"
        f"- Published {pub}, {up} HF upvotes at retrieval ({DATE}). Group: {group}.\n\n"
        f"## What it is\n{what}\n\n## Why it matters for Berylize\n{fit}\n\n"
        f"## Concepts\n" + "\n".join(f"- [[{c}]]" for c in concepts) + "\n\n"
        f"Index: [[Top 25 Hugging Face Papers - Live Digital Humans]]\n\n"
        f"> Summary derived from the paper's Hugging Face abstract blurb; read the paper before relying on specific numbers.\n"
    )
    write(f"papers/{paper_title(p)}.md", body)

# ---- paper index -------------------------------------------------------------------------
groups: dict[str, list] = defaultdict(list)
for p in PAPERS:
    groups[p[7]].append(p)
order = ["Streaming core", "Bi-directional conversation", "Expression and realism", "Real-time and affordable", "Conversation brain and speech"]
idx = [fm(type="index", tags=["index", "papers", "avatar"], retrieved=DATE),
       "# Top 25 Hugging Face Papers - Live Digital Humans\n",
       "Goal: live digital humans with **no uncanny valley**, **maximum human expression**, **bi-directional conversation**, **audio-driven diffusion**, built **affordably, profitably, dependably**.\n",
       f"Method: curated on {DATE} from Hugging Face paper searches (audio-driven talking head, streaming interactive avatars, full-duplex dialogue, emotion/expression, listener generation). "
       "Ranked by fit to the goal above, not by an official Hugging Face ranking; upvotes are shown only as a community signal.\n"]
n = 0
for g in order:
    idx.append(f"\n## {g}\n")
    idx.append("| # | Paper | Published | Upvotes | Takeaway |\n|---|---|---|---|---|")
    for p in groups[g]:
        n += 1
        idx.append(f"| {n} | [[{paper_title(p)}\\|{p[1]}]] | {p[3]} | {p[4]} | {p[5].split('. ')[0].rstrip('.')} |")
idx.append("\n## How to use this list\n- Building a core: read Streaming core, then [[Playbook - Build a Live Avatar Pipeline]].\n"
           "- Making it feel alive: Bi-directional conversation + Expression and realism, then [[Playbook - Uncanny Valley Audit]].\n"
           "- Keeping it cheap: Real-time and affordable, then [[Playbook - Affordable and Profitable Deployment]].\n"
           "- Team constraints that filter this list: [[EVE ECC Avatar Pipeline Research - Part 1]].\n")
write("MOC/Top 25 Hugging Face Papers - Live Digital Humans.md", "\n".join(idx))
# the index is linked as a note title; keep one copy at the vault root of MOC/

# ---- repos -------------------------------------------------------------------------------
for title, repo, stars, lic, pushed, kind, line, fit, rank in REPOS:
    write(f"repos/{title}.md",
          fm(type="repo", repo=repo, stars=stars, license=f'"{lic}"', last_push=pushed, rank=rank, tags=["repo", "avatar"], retrieved=DATE)
          + f"# {title}\n\nhttps://github.com/{repo}\n\n- Role: {kind}\n- Stars: {stars:,} | License: {lic} | Last push: {pushed} (as of {DATE})\n\n"
          f"## What it is\n{line}\n\n## Fit for Berylize\n{fit}\n\n"
          f"See [[Top 10 GitHub Projects - Live Digital Humans]], [[Licensing Audit]], [[Playbook - Build a Live Avatar Pipeline]].\n")
for title, repo, stars, lic, line in HONORABLE:
    write(f"repos/{title}.md",
          fm(type="repo", repo=repo, stars=stars, license=f'"{lic}"', tags=["repo", "avatar", "honorable-mention"], retrieved=DATE)
          + f"# {title}\n\nhttps://github.com/{repo}\n\n- Stars: {stars:,} | License: {lic} (as of {DATE})\n\n{line}\n\n"
          f"Honorable mention in [[Top 10 GitHub Projects - Live Digital Humans]]. Check [[Licensing Audit]] before use.\n")

rows = "\n".join(f"| {r[8]} | [[{r[0]}]] | {r[5]} | {r[2]:,} | {r[3]} | {r[7]} |" for r in REPOS)
hon = "\n".join(f"- [[{h[0]}]] ({h[2]:,} stars, {h[3]}): {h[4]}" for h in HONORABLE)
write("MOC/Top 10 GitHub Projects - Live Digital Humans.md",
      fm(type="index", tags=["index", "repos", "avatar"], retrieved=DATE)
      + "# Top 10 GitHub Projects - Live Digital Humans\n\n"
      f"Method: candidates found by GitHub topic/search on {DATE}; stars, license and last-push pulled from the GitHub API. "
      "Ranked by **fit to the live, affordable, commercial-safe conversational avatar goal**, not by stars alone.\n\n"
      "| Rank | Project | Role | Stars | License | Fit |\n|---|---|---|---|---|---|\n" + rows +
      "\n\n## Honorable mentions\n" + hon +
      "\n\nTeam shortlist context (what was kept or ruled out and why): [[EVE ECC Avatar Pipeline Research - Part 1]]. Combine with [[Top 25 Hugging Face Papers - Live Digital Humans]].\n")

# ---- concepts and playbooks --------------------------------------------------------------
for title, (tags, body) in CONCEPTS.items():
    extra = ""
    if by_concept.get(title):
        extra = "\n\n## Papers on this\n" + "\n".join(f"- {x}" for x in by_concept[title])
    write(f"concepts/{title}.md", fm(type="concept", tags=["concept"] + tags) + f"# {title}\n" + body.strip() + extra + "\n\nHome: [[Home]]\n")
for title, (tags, body) in PLAYBOOKS.items():
    write(f"playbooks/{title}.md", fm(type="playbook", tags=["playbook"] + tags) + f"# {title}\n" + body.strip().replace("[[LiteAvatar|LiteAvatar note in repos list]]", "[[LiteAvatar]]") + "\n\nHome: [[Home]]\n")

# ---- persona / expertise -----------------------------------------------------------------
write("persona/Berylize Persona.md", fm(type="persona", tags=["persona", "berylize"]) + """
# Berylize Persona

Berylize is the AI engineer inside the CRANE IDE (the model served on the GPU node, formerly addressed as Qwen; the size is appended, for example Berylize 14B).

**Primary knowledge** = the base model weights. **Second brain** = this vault, retrieved at question time ([[Conversation Brain and RAG]]). The vault is secondary: it informs, it does not override good engineering judgement, and it can be wrong or stale; each note carries its retrieval date.

Operating persona and rules live in `src/server/persona/berylize.md` (the Modelfile source). Expertise scope: [[Berylize Expertise Map]]. Diffusion foundation: [[Berylize Creatives]].

Behaviours: build or repair any live avatar pipeline end to end; measure before claiming; verify what is painted ([[Verification Layer]]); respect cost and licensing ([[Cost Ceiling and GPU Session Economics]], [[Licensing Audit]]); cite vault notes by name when using them.
""")
write("persona/Berylize Creatives.md", fm(type="persona", tags=["persona", "berylize", "diffusion"]) + """
# Berylize Creatives

The diffusion foundation of the IDE, formerly labelled MiniMax H3. It generates images and video for projects (`generate_image`, `generate_video` tools) and is the render-side generative engine alongside the audio-driven avatar cores in [[Top 10 GitHub Projects - Live Digital Humans]].

Naming: user-facing name is **Berylize Creatives**. Internals keep the legacy identifiers so nothing breaks: env `CRANE_MM_URL`, port 8011, API model ids `MiniMaxAI/MiniMax-Image-01` and `MiniMax-Video-01`, ZeroGPU Space fallback `CRANE_HF_MM_URL`.

Use it for: portraits and reference faces for avatars, backgrounds, B-roll, batch creative output (route batches to ZeroGPU, see [[Playbook - Affordable and Profitable Deployment]]). Photorealism is enforced in prompts to reduce the [[Uncanny Valley]] risk of 'AI gloss'. Not the real-time render core: that is [[SoulX-FlashHead]] class models.
""")
write("persona/Berylize Expertise Map.md", fm(type="persona", tags=["persona", "skills", "berylize"]) + """
# Berylize Expertise Map

What an expert needs to build or repair live conversational avatar workflows, and where it lives in the vault.

| Domain | Must know | Notes |
|---|---|---|
| Real-time systems | frame/block streaming, queues, backpressure, shared clocks, cancellation | [[Block-wise Generation]], [[Latency Budget]] |
| Speech | streaming ASR, semantic VAD, streaming TTS, echo cancellation, barge-in, backchannel | [[Streaming ASR and Semantic VAD]], [[Streaming TTS]], [[Barge-In]] |
| Conversation design | full-duplex turn-taking, listener behaviour, persona, affect tagging | [[Turn-Taking and Full-Duplex]], [[Listening Behavior]], [[Conversation Brain and RAG]] |
| Generative video | AR streaming diffusion, distillation, KV memory, drift, motion latents | [[Autoregressive Streaming Diffusion]], [[Exposure Bias and Identity Drift]], [[Audio-Driven Motion Latents]] |
| Facial animation | visemes, ARKit blendshapes, emotion control, gaze, blinks | [[Visemes and Lip Sync]], [[ARKit Blendshapes]], [[Emotion and Expression Control]] |
| 3D/graphics | Gaussian splatting avatars, WebGL/engine rendering | [[Gaussian Splatting Avatars]] |
| Networking | WebRTC, ICE/TURN, jitter buffers, codecs, NVENC | [[WebRTC Delivery]] |
| GPU and MLOps | VRAM budgeting, FP8, spot sessions, cold start, images/volumes, tunnels | [[Cost Ceiling and GPU Session Economics]], [[Cold Start Strategy]], [[Distillation and Quantization]] |
| Quality science | uncanny valley, sync thresholds, perceptual tests, verification on pixels | [[Uncanny Valley]], [[Verification Layer]] |
| Business and legal | dependency-tree license audit, pricing per session minute, reliability | [[Licensing Audit]], [[Playbook - Affordable and Profitable Deployment]] |
| Debug method | per-node isolation, timestamps, regression checks | [[Playbook - Repair a Broken Avatar Pipeline]], [[Playbook - Latency Debugging]] |

Reference stacks: [[Tokkio Guide Map]], [[Beryl OS Pipeline v0.2]], [[Beryl Re-Engineering Map]], [[OpenAvatarChat]]. Start: [[Playbook - Build a Live Avatar Pipeline]].
""")

# ---- add frontmatter + related links to pre-existing pipeline notes ----------------------
PIPE = {
    "Tokkio Guide Map": ["pipeline", "nvidia", "reference"],
    "Beryl Re-Engineering Map": ["pipeline", "beryl", "reference"],
    "Beryl OS Pipeline v0.2": ["pipeline", "beryl", "reference"],
    "TESTING LIVE AVATAR EVE PIPELINE": ["pipeline", "testing", "mastering-suite"],
}
for stem, tags in PIPE.items():
    p = VAULT / "pipeline" / f"{stem}.md"
    if p.exists() and not p.read_text().startswith("---"):
        p.write_text(fm(type="pipeline", tags=tags, imported=DATE) + f"Related: [[Live Avatar Pipeline]] · [[Latency Budget]] · [[Verification Layer]] · [[Playbook - Build a Live Avatar Pipeline]]\n\n" + p.read_text())

# ---- Home ---------------------------------------------------------------------------------
write("Home.md", fm(type="moc", tags=["moc", "home"]) + f"""
# CRANE Second Brain - Digital Humans OS

Berylize's secondary knowledge base for building **live conversational 3D/2D digital humans**: no uncanny valley, maximum expression, bi-directional conversation, audio-driven diffusion, affordable, profitable, dependable. Open this folder as an Obsidian vault (Graph view shows the link map).

## Start here
- [[Playbook - Build a Live Avatar Pipeline]] / [[Playbook - Repair a Broken Avatar Pipeline]]
- [[Live Avatar Pipeline]] (hub) · [[Berylize Expertise Map]]
- [[Top 25 Hugging Face Papers - Live Digital Humans]]
- [[Top 10 GitHub Projects - Live Digital Humans]]

## Pipeline references (user-compiled)
[[Tokkio Guide Map]] · [[Beryl Re-Engineering Map]] · [[Beryl OS Pipeline v0.2]] · [[TESTING LIVE AVATAR EVE PIPELINE]]

## Team research
[[EVE ECC Avatar Pipeline Research - Part 1]] · [[Beryl Live Human OS - Realism, Consciousness and JEV - Part 2]]

## Playbooks
[[Playbook - Uncanny Valley Audit]] · [[Playbook - Affordable and Profitable Deployment]] · [[Playbook - Latency Debugging]]

## Personas
[[Berylize Persona]] · [[Berylize Creatives]]

## Concepts
""" + "\n".join(f"- [[{c}]]" for c in CONCEPTS) + f"\n\nSeeded {DATE}. Notes link with wikilinks; frontmatter `type`/`tags` drive the graph colors and the CRANE retriever's link-graph boosts.\n")

# ---- .obsidian config ---------------------------------------------------------------------
def rgb(r, g, b): return (r << 16) + (g << 8) + b
cfg = VAULT / ".obsidian"
cfg.mkdir(exist_ok=True)
def jwrite(name, obj):
    p = cfg / name
    if FORCE or not p.exists():
        p.write_text(json.dumps(obj, indent=2) + "\n"); written.append(f".obsidian/{name}")
jwrite("app.json", {"alwaysUpdateLinks": True, "newLinkFormat": "shortest", "useMarkdownLinks": False, "attachmentFolderPath": "_attachments"})
jwrite("core-plugins.json", ["file-explorer", "global-search", "graph", "backlink", "outgoing-link", "tag-pane", "page-preview", "properties", "outline"])
jwrite("graph.json", {"showTags": False, "showAttachments": False, "hideUnresolved": False, "colorGroups": [
    {"query": "path:papers", "color": {"a": 1, "rgb": rgb(160, 132, 216)}},
    {"query": "path:repos", "color": {"a": 1, "rgb": rgb(96, 165, 250)}},
    {"query": "path:concepts", "color": {"a": 1, "rgb": rgb(217, 180, 90)}},
    {"query": "path:playbooks", "color": {"a": 1, "rgb": rgb(62, 207, 142)}},
    {"query": "path:pipeline", "color": {"a": 1, "rgb": rgb(240, 138, 58)}},
    {"query": "path:research", "color": {"a": 1, "rgb": rgb(255, 93, 93)}},
    {"query": "path:persona", "color": {"a": 1, "rgb": rgb(241, 220, 146)}},
    {"query": "path:MOC", "color": {"a": 1, "rgb": rgb(236, 230, 242)}}]})

print(f"wrote {len(written)} files")
