Beryl Live Human OS · Pipeline v0.2

# Render fork · Brain · Decider verification mesh

SoulX-FlashHead → LeapTalk fork for render, Nemotron + Advanced Memory as the brain, and **Decider (tyronne-os/decider-plugin-brain-beryl)** as the always-on verification layer — self-hosted, Apache-2.0, already on GPU, zero marginal cost per call.

Apache-2.0 stack Decider · on GPU · ready POST /v1/systemone L0 \<1s control plane

**Pipeline blueprint — v0.2** scroll right on small screens

signal path — audio / render data

Decider verification check

retired — replaced by fork

## Render fork provenance

Render engine forked from `zhangrongxiang/LeapTalk`, itself built on `Soul-AILab/SoulX-FlashHead` — both Apache-2.0, dependency tree audited clean. Ships the photo-in / streaming-video-out UI shape the project needs out of the box.

Base modelFlashHead-1.3B

Fork layerLeapTalk (LoRA, 1 NFE)

Turn-takingSoulX-Duplug 0.6B

Target GPU1× RTX 4090

## Decider — the verification fork

`tyronne-os/decider-plugin-brain-beryl` is a fork of `Mapika/decider` — an open reproduction of the B.B.P (Beryl Brain Plugin) architecture, built on Qwen3.5-2B and 35B-A3B bases. Already on GPU. Already speaks `POST /v1/systemone` — the TypeSafe SDK works unchanged with `TYPESAFE_BASE_URL` pointing at the local server.

**decider-35b-a3b scores 0.774 Bespoke macro**, beating B.B.P 0.760. Fine-tunable via `scripts/train.sh full` — your own MOTION and AWARENESS failure cases become training data nobody else has.

LicenseApache-2.0

API surfacePOST /v1/systemone

Marginal cost$0 (self-hosted)

Fine-tuningscripts/train.sh full

## Three checks — Decider schemas

Each runs on every turn against real signal — not a sampled certification pass. Identical schemas to what was designed for B.B.P; Decider speaks the same endpoint.

proprioception: stated_stage, telemetry_stage, consistent: bool, confidence: float

motion (painted pixels, not values): is_motion_visible: bool, occluding_layer: string | null

listening cross-check: duplug_state, audio_energy_pattern, agrees: bool, confidence: float

Pipeline v0.2 · Decider on GPU · Apache-2.0 stack · decider-35b-a3b beats B.B.P 0.760 on Bespoke macro suite (0.774) · fine-tune on Beryl's own failure cases to widen the gap further