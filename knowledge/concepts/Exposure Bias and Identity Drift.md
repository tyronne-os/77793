---
type: concept
tags: [concept, diffusion, quality]
---
# Exposure Bias and Identity Drift
In autoregressive generation the model is trained on clean history but at inference conditions on its own imperfect output, so small errors compound: skin tone shifts, face morphs, colors saturate, mouth shapes degrade. Fixes seen in the papers: self-forcing / diffusion forcing style training, sliding-window local-future denoising ([[AvatarForcing One-Step - 2603.14331]]), bidirectional self-correcting distillation ([[SoulX-FlashTalk - 2512.23379]]), anchoring on a reference or sink frame ([[Live Avatar - 2512.04677]]), memory modules ([[MEMO - 2412.04448]]). Operational mitigations: periodic re-anchor to the source portrait, limit session length, monitor drift with a face-identity embedding distance and alert via the [[Verification Layer]].

## Papers on this
- [[Avatar Forcing - 2601.00664]]
- [[SoulX-FlashTalk - 2512.23379]]
- [[AvatarForcing One-Step - 2603.14331]]
- [[MEMO - 2412.04448]]
- [[SoulX-LiveAct - 2603.11746]]

Home: [[Home]]
