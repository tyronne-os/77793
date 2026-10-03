---
type: concept
tags: [concept, quality, reliability]
---
# Verification Layer
Principle from the team research: **verify what is painted, not what the code says it painted.** The old MOTION check read transform values and passed a face hidden behind an opaque layer. Decider / JEV style System-One classifiers return a typed decision plus calibrated confidence in ~70-500 ms and can run every block:
- proprioception: {stated_stage, telemetry_stage, consistent, confidence}
- motion: {is_motion_visible, occluding_layer}
- listening cross-check: {duplug_state, audio_energy_pattern, agrees}
Hook it at the 48-frame block boundary ([[Block-wise Generation]]) so bad blocks are caught before streaming. See [[Beryl OS Pipeline v0.2]] and [[Beryl Live Human OS - Realism, Consciousness and JEV - Part 2]]. Pair with [[Full-Duplex-Bench - 2503.04721]] style tests.

## Papers on this
- [[Full-Duplex-Bench - 2503.04721]]

Home: [[Home]]
