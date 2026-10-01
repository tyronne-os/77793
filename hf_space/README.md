---
title: CRANE ZeroGPU Gen
emoji: 🏗️
colorFrom: orange
colorTo: purple
sdk: gradio
sdk_version: "4.42.0"
app_file: app.py
pinned: true
license: apache-2.0
---

# CRANE ZeroGPU Generation Space

OpenAI-compatible image and video generation API running on HF ZeroGPU (free A100).

CRANE uses this as a fallback when `berylize-node` is paused — set `CRANE_HF_MM_URL` to this Space URL.

## Endpoints

| Method | Path | Model |
|--------|------|-------|
| POST | `/v1/images/generations` | FLUX.1-schnell |
| POST | `/v1/video/generations` | CogVideoX-5B |
| GET | `/health` | — |

## Deploy

1. Create a new Space on Hugging Face (ZeroGPU hardware)
2. Push this folder: `huggingface-cli upload <your-username>/crane-gen hf_space/ --repo-type=space`
3. Set `CRANE_HF_MM_URL=https://<your-username>-crane-gen.hf.space` in CRANE vault
