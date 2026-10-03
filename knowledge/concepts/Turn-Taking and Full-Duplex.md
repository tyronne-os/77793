---
type: concept
tags: [concept, conversation, audio]
---
# Turn-Taking and Full-Duplex
Half-duplex (wait for silence, then answer) feels like a walkie-talkie. Natural conversation is **full-duplex**: both sides can speak, overlap, backchannel ('mm-hm'), and interrupt.

Practical stack for an avatar:
- Semantic turn detector (SoulX-Duplug 0.6B in Beryl: idle / nonidle / speak / blank) instead of a raw silence timer, see [[Streaming ASR and Semantic VAD]].
- [[Barge-In]]: when the user speaks over the avatar, cut TTS within ~200 ms and flip the face to listening.
- [[Listening Behavior]]: face keeps reacting while the user talks.
- True end-to-end full-duplex models exist ([[OmniFlatten - 2410.17799]]) but cascaded designs ([[FireRedChat - 2509.06502]]) are easier to debug and swap.
Measure with [[Full-Duplex-Bench - 2503.04721]]: pause handling, backchannel, turn-taking, interruption.

## Papers on this
- [[Avatar Forcing - 2601.00664]]
- [[INFP - 2412.04037]]
- [[UniLS - 2512.09327]]
- [[OmniFlatten - 2410.17799]]
- [[Full-Duplex-Bench - 2503.04721]]
- [[FireRedChat - 2509.06502]]

Home: [[Home]]
