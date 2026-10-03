---
type: playbook
tags: [playbook, playbook, latency]
---
# Playbook - Latency Debugging
1. Put timestamps on a shared clock at: speech end, ASR final, LLM first token, TTS first chunk, render first frame, frame displayed.
2. Compute each hop; compare to [[Latency Budget]].
3. Typical culprits: endpointing timer too long; LLM waiting for a full sentence; TTS not streaming; render not warmed or in dev mode ([[Cold Start Strategy]]); too many diffusion steps ([[Distillation and Quantization]]); large block size ([[Block-wise Generation]]); network/TURN relay ([[WebRTC Delivery]]); Python GIL or sync I/O in the control plane.
4. Fix the largest hop first; re-measure; keep a latency regression test.
5. Mask what you cannot fix: instant listening reaction, a filler/backchannel, and L0 idle presence ([[Live Avatar Pipeline]]).

Home: [[Home]]
