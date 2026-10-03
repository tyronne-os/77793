---
type: playbook
tags: [playbook, playbook, debug]
---
# Playbook - Repair a Broken Avatar Pipeline
Diagnose by symptom, narrowing to one node using per-node health, ports and timestamps.
| Symptom | Likely cause | Check / fix |
|---|---|---|
| Face frozen / blinking portrait | Render not painting (transform-only layer, occluded) | [[Verification Layer]] motion check on real pixels; confirm model output reaches the canvas |
| No video, audio ok | WebRTC track failure, encoder crash | ICE state, TURN, encoder logs; [[WebRTC Delivery]] |
| Lips drift out of sync over time | Separate audio/video clocks | Single media clock, timestamps per chunk; [[Visemes and Lip Sync]] |
| Long pause before answer | A hop over budget | [[Playbook - Latency Debugging]] |
| Interrupt ignored / avatar talks over user | Stale queues, no echo cancel | [[Barge-In]] flush logic |
| Avatar cut off mid-thought | VAD timer too aggressive | Semantic VAD, [[Turn-Taking and Full-Duplex]] |
| Face morphs/colors shift after minutes | [[Exposure Bias and Identity Drift]] | Re-anchor, shorter windows, sink frame |
| Says 'I'm at L0' while in L1 | Stated vs telemetry mismatch (proprioception) | Verification proprioception check ([[Beryl Live Human OS - Realism, Consciousness and JEV - Part 2]]) |
| First load 3+ s | Dev build, cold weights | Production build, preloaded weights ([[Cold Start Strategy]]) |
| CUDA OOM | Model + KV cache + SR too big | Lower res, FP8, bounded KV ([[Long-Horizon Memory]], [[Distillation and Quantization]]) |
| Node offline in Backend panel | Tunnel/port down | Re-open SSH tunnel (8010 LLM, 8011 creatives, 8012 TTS), check `vllm` unit |
Method: reproduce, isolate one node with its Test button, measure, fix, add a regression check to the verification layer.

Home: [[Home]]
