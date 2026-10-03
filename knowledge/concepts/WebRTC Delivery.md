---
type: concept
tags: [concept, delivery, latency]
---
# WebRTC Delivery
Browser delivery: send encoded video plus audio over WebRTC with a small jitter buffer; signaling, ICE, STUN/TURN. Sub-100 ms network latency requires regional placement and TURN fallback. Keep audio and video in one RTP session so the browser keeps lip sync. Frameworks that already solve this: [[LiveKit Agents]], [[Pipecat]]; NVIDIA reference in [[Tokkio Guide Map]]. Encode on GPU (NVENC) to avoid CPU bottlenecks. Part of the [[Latency Budget]].

Home: [[Home]]
