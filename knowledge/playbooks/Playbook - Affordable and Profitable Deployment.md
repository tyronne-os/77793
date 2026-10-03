---
type: playbook
tags: [playbook, playbook, business]
---
# Playbook - Affordable and Profitable Deployment
Affordable: choose the cheapest tier that passes the audit.
| Tier | Approach | Cost shape |
|---|---|---|
| Floor | 3DGS on-device ([[Gaussian Splatting Avatars]]) or CPU 2D ([[LiteAvatar]]) | near-zero server GPU |
| Core | 1.3B real-time on L4/4090 ([[SoulX-FlashHead]], [[Ditto]]) | ~$0.31-0.40/hr only while a session is live |
| Premium | 14B pipeline-parallel ([[SoulX-FlashTalk]], [[LiveAvatar]]) | multi-GPU, offline or high-ticket only |
Profit levers: session-gated billing ([[Cost Ceiling and GPU Session Economics]]); several streams per GPU; cheap per-turn verification instead of LLM judges; clean licenses so you can charge ([[Licensing Audit]]); batch creative output via ZeroGPU ([[Berylize Creatives]]).
Product shapes that tolerate current quality and pay: customer service, tutors, concierge, onboarding, companions with a human face. Charge per minute of live session with a floor, price above GPU cost x utilization buffer.
Dependability: health checks per node, auto-fallback (NIM / ZeroGPU), idle shutdown, session recording of latency stats ([[Playbook - Repair a Broken Avatar Pipeline]]).

Home: [[Home]]
