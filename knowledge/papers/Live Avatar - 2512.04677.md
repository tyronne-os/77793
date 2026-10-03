---
type: paper
arxiv: "2512.04677"
published: 2025-12
hf_upvotes: 133
group: "Streaming core"
tags: [paper, avatar, streaming-core]
source: huggingface-papers
retrieved: 2026-10-02
---
# Live Avatar (2512.04677)

**Live Avatar: Streaming Real-time Audio-Driven Avatar Generation with Infinite Length**

- arXiv: https://arxiv.org/abs/2512.04677
- Hugging Face: https://huggingface.co/papers/2512.04677
- Published 2025-12, 133 HF upvotes at retrieval (2026-10-02). Group: Streaming core.

## What it is
14B diffusion model for real-time, infinite-length audio-driven avatars. Timestep-forcing Pipeline Parallelism and a Rolling Sink Frame Mechanism keep identity stable over long streams.

## Why it matters for Berylize
Best published reference for infinite-length streaming. Team research ruled it out as the base: needs ~5x H800 for real-time, far over the ~$0.40/hr ceiling. Study its rolling sink frame for identity stability.

## Concepts
- [[Autoregressive Streaming Diffusion]]
- [[Long-Horizon Memory]]
- [[Block-wise Generation]]
- [[Cost Ceiling and GPU Session Economics]]

Index: [[Top 25 Hugging Face Papers - Live Digital Humans]]

> Summary derived from the paper's Hugging Face abstract blurb; read the paper before relying on specific numbers.
