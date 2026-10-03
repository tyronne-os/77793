---
type: concept
tags: [concept, conversation, audio]
---
# Barge-In
Barge-in = the user interrupts the avatar. Requirements: (1) detect user speech while TTS plays, with echo cancellation so the avatar's own voice is not mistaken for the user; (2) stop audio and render stream immediately, flush queued TTS and queued video blocks; (3) tell the LLM what was actually spoken (truncate the assistant message at the interruption point); (4) switch the face to listening within one frame block. Failure modes: avatar keeps talking for a second after interruption (stale queue), or false barge-in from background noise (add a minimum duration plus semantic check). Details in [[Turn-Taking and Full-Duplex]].

## Papers on this
- [[OmniFlatten - 2410.17799]]
- [[Full-Duplex-Bench - 2503.04721]]
- [[FireRedChat - 2509.06502]]

Home: [[Home]]
