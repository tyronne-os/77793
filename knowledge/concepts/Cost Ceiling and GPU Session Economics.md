---
type: concept
tags: [concept, cost, business]
---
# Cost Ceiling and GPU Session Economics
Team ceiling (research): about **$0.40/hr, GPU-resident** (GCP L4 g2-standard-4 today; $240 GCP credits expire 2026-11-01). Frontier-scale models (14B-22B on 5-8 H800/H200) are out for the product but fine for quality references. Levers:
- Pick a 1.3B-class core ([[SoulX-FlashHead]]) on one 4090/L4/L40S.
- **Session-based billing** (Elana GPU Session Manager): start on first audio frame, stop on silence; spot instances ~$0.31/hr while talking ([[Beryl Re-Engineering Map]]).
- Multiple concurrent streams per GPU (FlashHead reports 3 streams at 25+ fps on one 4090).
- Offload rendering to the viewer for 3DGS avatars ([[TaoAvatar - 2503.17032]]).
- Route batch/creative jobs to ZeroGPU rather than the live node ([[Berylize Creatives]]).
Revenue side in [[Playbook - Affordable and Profitable Deployment]]. Related: [[Cold Start Strategy]], [[Licensing Audit]].

## Papers on this
- [[Live Avatar - 2512.04677]]
- [[Hallo-Live - 2604.23632]]
- [[TaoAvatar - 2503.17032]]

Home: [[Home]]
