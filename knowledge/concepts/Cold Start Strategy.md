---
type: concept
tags: [concept, cost, latency]
---
# Cold Start Strategy
Download weights once into an image or network volume; every session attaches pre-loaded weights. Keep the control plane warm (<1 s) and warm data-plane nodes progressively (L0 -> L1 -> L2). Do not run in dev mode: the Mastering Suite flagged a 3.77 s load caused by Vite dev-mode ([[TESTING LIVE AVATAR EVE PIPELINE]]). Spot instance start plus attach should be minutes at most, so show L0 idle presence while data nodes warm ([[Live Avatar Pipeline]]). See [[Cost Ceiling and GPU Session Economics]].

## Papers on this
- [[SoulX-FlashTalk - 2512.23379]]

Home: [[Home]]
