---
type: concept
tags: [concept, diffusion, render]
---
# Long-Horizon Memory
Minutes-to-hours streams need bounded memory. Techniques: rolling sink frame (always keep the reference frame in attention), bounded KV caches, compressed or convolutional KV memory ([[SoulX-LiveAct - 2603.11746]]), unbounded rotary position encoding ([[JoyAvatar - 2512.11423]]), memory-guided diffusion ([[MEMO - 2412.04448]]). Trade-off: bigger cache = better consistency but more VRAM and latency. Related: [[Exposure Bias and Identity Drift]].

## Papers on this
- [[Live Avatar - 2512.04677]]
- [[MEMO - 2412.04448]]
- [[MirrorMe - 2506.22065]]
- [[JoyAvatar - 2512.11423]]
- [[SoulX-LiveAct - 2603.11746]]

Home: [[Home]]
