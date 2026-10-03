---
type: concept
tags: [concept, diffusion, render]
---
# Autoregressive Streaming Diffusion
Instead of generating a whole clip, generate video in short **blocks** conditioned on audio and previously generated frames, so the first frame appears quickly and the stream can run indefinitely. Key ingredients: causal or block-causal attention, KV cache of previous blocks ([[Long-Horizon Memory]]), few-step distillation ([[Distillation and Quantization]]) down to 1-4 steps, and defenses against error accumulation ([[Exposure Bias and Identity Drift]]). Throughput must exceed playback fps with headroom; pipeline parallelism across GPUs is how 14B models reach real-time ([[Live Avatar - 2512.04677]]), while 1.3B models do it on a single card ([[SoulX-FlashHead]]). Block size sets the minimum added latency; see [[Block-wise Generation]].

## Papers on this
- [[Live Avatar - 2512.04677]]
- [[AvatarForcing One-Step - 2603.14331]]
- [[X-Actor - 2508.02944]]
- [[LLIA - 2506.05806]]
- [[RAP - 2508.05115]]
- [[JoyAvatar - 2512.11423]]
- [[SoulX-LiveAct - 2603.11746]]
- [[Omni-LiveAvatar - 2608.13602]]
- [[Hallo-Live - 2604.23632]]

Home: [[Home]]
