---
type: playbook
tags: [playbook, playbook, build]
---
# Playbook - Build a Live Avatar Pipeline
Goal: photo in, a face that listens and answers live, under budget.
1. **Constraints first**: cost ceiling, hardware, license policy ([[Cost Ceiling and GPU Session Economics]], [[Licensing Audit]]). Eliminate candidates before benchmarking.
2. **Pick the render core** with a bake-off on the target GPU: first-frame latency, sustained fps with headroom, identity drift at 5 min, listening quality. Default shortlist: [[SoulX-FlashHead]], [[Ditto]], then quality tier [[SoulX-FlashTalk]].
3. **Audio side**: semantic VAD + streaming ASR ([[Streaming ASR and Semantic VAD]]), streaming TTS ([[Streaming TTS]]); consider [[Pipecat]] or [[LiveKit Agents]] instead of hand-rolling.
4. **Brain**: persona, short spoken answers, affect tags ([[Conversation Brain and RAG]]).
5. **Glue**: one shared clock, block-wise streaming socket ([[Block-wise Generation]]), explicit node contracts (input, output, port, latency budget) as in the Mastering Suite.
6. **Delivery**: [[WebRTC Delivery]].
7. **Presence before data**: L0 idle loop + [[Listening Behavior]] so the face is alive while models warm ([[Cold Start Strategy]]).
8. **Verify**: [[Verification Layer]] on painted pixels, then [[Playbook - Uncanny Valley Audit]].
9. **Cost controls**: session start/stop, concurrency, ZeroGPU for batch ([[Playbook - Affordable and Profitable Deployment]]).
Reference architectures: [[Tokkio Guide Map]] (NVIDIA), [[Beryl OS Pipeline v0.2]], [[Beryl Re-Engineering Map]], [[OpenAvatarChat]].

Home: [[Home]]
