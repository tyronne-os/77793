---
type: concept
tags: [concept, latency, pipeline]
---
# Latency Budget
Human turn gaps average roughly 200 ms, so anything over ~1 s from the user stopping to the avatar's first visible reaction reads as laggy.

Working budget, user-stops-speaking to first painted frame (target, tune by measurement):
| Stage | Target |
|---|---|
| Endpointing / semantic VAD | 100-200 ms |
| LLM time-to-first-token (streamed) | 250-400 ms |
| TTS first audio chunk | 100-200 ms (Qwen3-TTS 0.6B is documented at ~97 ms) |
| Render first frame | 100-400 ms ([[LiveAvatar]] reports ~385 ms) |
| Network + WebRTC jitter buffer | 50-150 ms |

Rules: stream everything; never wait for a full LLM sentence before starting TTS (flush at clause boundaries); start a listening/reaction animation immediately on end-of-speech so the face moves before the words arrive. Measure each hop with timestamps on one shared clock (the Media Clock node). See [[Playbook - Latency Debugging]] and [[Cold Start Strategy]].

## Papers on this
- [[LLIA - 2506.05806]]
- [[RAP - 2508.05115]]
- [[Ditto - 2411.19509]]
- [[MirrorMe - 2506.22065]]
- [[Hi-Reco - 2511.12662]]

Home: [[Home]]
