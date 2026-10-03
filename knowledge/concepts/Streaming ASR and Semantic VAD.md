---
type: concept
tags: [concept, audio, conversation]
---
# Streaming ASR and Semantic VAD
Streaming ASR gives partial transcripts so the LLM can begin early; a **semantic VAD** decides whether a pause is a turn end or a thinking pause (a plain silence timer cuts people off or adds dead air). Riva ASR (gRPC, ~100 ms) and SoulX-Duplug 0.6B (idle/nonidle/speak/blank) appear in the Beryl pipeline ([[Beryl Re-Engineering Map]]). Add echo cancellation for [[Barge-In]]. Framework options: [[Pipecat]], [[LiveKit Agents]].

## Papers on this
- [[FireRedChat - 2509.06502]]

Home: [[Home]]
