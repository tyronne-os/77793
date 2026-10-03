---
type: concept
tags: [concept, render, diffusion]
---
# Audio-Driven Motion Latents
Instead of diffusing pixels, predict a compact **motion representation** (keypoints, 3DMM/FLAME coefficients, motion latents) from audio, then render with a fast warping/rendering network. Much cheaper and more controllable (head pose, emotion, gaze) than pixel diffusion. Examples: [[FLOAT - 2412.01064]] (flow matching in motion latent space), [[Ditto - 2411.19509]] (explicit motion space), [[UniLS - 2512.09327]]. Weakness: detail like hair and teeth depends on the renderer. Good candidate for the affordable tier in [[Playbook - Affordable and Profitable Deployment]].

## Papers on this
- [[UniLS - 2512.09327]]
- [[FLOAT - 2412.01064]]
- [[EMO2 - 2501.10687]]
- [[Ditto - 2411.19509]]

Home: [[Home]]
