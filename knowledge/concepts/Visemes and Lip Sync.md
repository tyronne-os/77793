---
type: concept
tags: [concept, audio, expression]
---
# Visemes and Lip Sync
A viseme is the mouth shape for a group of phonemes (about 15 classes cover English). Two routes: phoneme/viseme timeline from TTS, or end-to-end audio-to-motion models that never expose visemes. Check: closed-lip bilabials (p, b, m), labiodentals (f, v) with lip-teeth contact, and rounded vowels (oo, oh). Common bug: audio and video clocks drift, so lips slowly desync; share one clock and timestamp every audio chunk and frame. Sync thresholds are in [[Uncanny Valley]]. Lip-sync-only tools: [[MuseTalk]].

Home: [[Home]]
