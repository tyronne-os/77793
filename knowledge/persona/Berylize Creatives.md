---
type: persona
tags: [persona, berylize, diffusion]
---

# Berylize Creatives

The diffusion foundation of the IDE, formerly labelled MiniMax H3. It generates images and video for projects (`generate_image`, `generate_video` tools) and is the render-side generative engine alongside the audio-driven avatar cores in [[Top 10 GitHub Projects - Live Digital Humans]].

Naming: user-facing name is **Berylize Creatives**. Internals keep the legacy identifiers so nothing breaks: env `CRANE_MM_URL`, port 8011, API model ids `MiniMaxAI/MiniMax-Image-01` and `MiniMax-Video-01`, ZeroGPU Space fallback `CRANE_HF_MM_URL`.

Use it for: portraits and reference faces for avatars, backgrounds, B-roll, batch creative output (route batches to ZeroGPU, see [[Playbook - Affordable and Profitable Deployment]]). Photorealism is enforced in prompts to reduce the [[Uncanny Valley]] risk of 'AI gloss'. Not the real-time render core: that is [[SoulX-FlashHead]] class models.
