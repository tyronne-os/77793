---
type: concept
tags: [concept, audio]
---
# Streaming TTS
Needs first-audio under ~200 ms and chunked output so rendering can start before the sentence finishes. Qwen3-TTS 0.6B (Apache-2.0, 9 timbres, ~97 ms streaming latency per [[Beryl Re-Engineering Map]]) and Kokoro 82M (local, voice cloning in the CRANE backend) are the nodes in this stack. Flush text to TTS at clause boundaries, keep prosody consistent across chunks, and return word/phoneme timings if possible for [[Visemes and Lip Sync]]. Voice and face emotion must agree: [[Emotion and Expression Control]].

## Papers on this
- [[FireRedChat - 2509.06502]]

Home: [[Home]]
