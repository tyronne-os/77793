---
type: persona
tags: [persona, skills, berylize]
---

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
