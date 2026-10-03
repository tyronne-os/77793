---
type: concept
tags: [concept, hub, pipeline]
---
# Live Avatar Pipeline
The loop: **mic -> [[Streaming ASR and Semantic VAD]] -> [[Conversation Brain and RAG]] -> [[Streaming TTS]] -> audio-driven render ([[Autoregressive Streaming Diffusion]] or [[Audio-Driven Motion Latents]]) -> [[WebRTC Delivery]] -> screen**, with [[Turn-Taking and Full-Duplex]] running beside it and a [[Verification Layer]] checking what was actually painted.

Two planes (from [[Beryl OS Pipeline v0.2]]):
- **Control plane** answers in under 1 s, always: presence, state, routing. Never blocks on the GPU.
- **Data plane** (render, TTS, SR) may warm up cold, but must hit the [[Latency Budget]] once hot.

Stages in the Beryl Mastering Suite: L0 Idle Presence, L1 Audio2Face / live render, L2 cinematic (Omniverse). Progressive: L0 -> L1 -> L2.

Design rule: assembling components and making them behave as one living thing are different problems ([[EVE ECC Avatar Pipeline Research - Part 1]]). Own the signal contracts between nodes.

Start with [[Playbook - Build a Live Avatar Pipeline]]; when something is broken use [[Playbook - Repair a Broken Avatar Pipeline]].

Home: [[Home]]
