---
type: concept
tags: [concept, render, latency]
---
# Block-wise Generation
LiveAvatar-style 48-frame blocks: generate, stream, repeat. Block length is the latency floor and the natural **checkpoint** for verification, barge-in cut points and audio chunking. The streaming socket wrapper in the Beryl design turns a file-in/file-out `generate()` into live mic-in/frame-out by chunking audio into blocks ([[Beryl Re-Engineering Map]]). Related: [[Autoregressive Streaming Diffusion]], [[Verification Layer]], [[Barge-In]].

## Papers on this
- [[Live Avatar - 2512.04677]]

Home: [[Home]]
