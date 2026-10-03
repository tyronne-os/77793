---
type: concept
tags: [concept, diffusion, cost]
---
# Distillation and Quantization
Make heavy diffusion cheap: step distillation (4-step DMD, 1-NFE LoRA like LeapTalk), FP8 or INT8 weights, cached static features ([[RAP - 2508.05115]]), preference distillation ([[Hallo-Live - 2604.23632]]). Always re-test quality after quantization (skin texture and teeth first). BitNet-style 1.58-bit does not cleanly apply to the diffusion core, see [[Beryl Re-Engineering Map]]. Supports [[Cost Ceiling and GPU Session Economics]].

## Papers on this
- [[SoulX-FlashTalk - 2512.23379]]
- [[AvatarForcing One-Step - 2603.14331]]
- [[RAP - 2508.05115]]
- [[JoyAvatar - 2512.11423]]
- [[Omni-LiveAvatar - 2608.13602]]
- [[Hallo-Live - 2604.23632]]

Home: [[Home]]
