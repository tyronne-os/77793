---
type: index
tags: [index, repos, avatar]
retrieved: 2026-10-02
---
# Top 10 GitHub Projects - Live Digital Humans

Method: candidates found by GitHub topic/search on 2026-10-02; stars, license and last-push pulled from the GitHub API. Ranked by **fit to the live, affordable, commercial-safe conversational avatar goal**, not by stars alone.

| Rank | Project | Role | Stars | License | Fit |
|---|---|---|---|---|---|
| 1 | [[SoulX-FlashHead]] | Render core (foundation) | 1,097 | Apache-2.0 | Team's chosen foundation (research Part 1): Apache-2.0 with clean dependency tree, ~1x RTX 4090 real-time per README. Best fit for the $0.40/hr ceiling. |
| 2 | [[SoulX-FlashTalk]] | Render core (quality tier) | 1,529 | Apache-2.0 | Quality-ceiling sibling of FlashHead. Use when budget allows a bigger GPU or for batch/offline mastering. |
| 3 | [[OpenAvatarChat]] | Full conversational stack | 3,785 | Apache-2.0 | Closest open reference to the whole loop (mic to face). Read its handler/backend plug-in layout before designing Beryl's node contracts. |
| 4 | [[Pipecat]] | Realtime voice-agent framework | 16,150 | BSD-2-Clause | Pipeline/frame abstractions for streaming audio, VAD, interruption handling. Candidate orchestration layer for the audio side. |
| 5 | [[LiveKit Agents]] | WebRTC agent framework | 14,453 | Apache-2.0 | Production WebRTC transport, turn detection and agent lifecycle. Solves delivery so effort goes to the avatar itself. |
| 6 | [[LiveAvatar]] | Reference architecture | 2,448 | Apache-2.0 | Excellent ideas, wrong hardware: team research found 5x H800 80GB for real-time. Adopt concepts (block-wise gen, rolling sink frame), not the deployment. |
| 7 | [[MuseTalk]] | Lip-sync module | 6,653 | NOASSERTION (check LICENSE) | Practical lip-sync on modest GPUs and a common Linly/OpenAvatar backend. License field is not machine-readable: audit before commercial use. |
| 8 | [[Ditto]] | Real-time talking head | 899 | Apache-2.0 | Apache-2.0 real-time option with explicit motion control. Good candidate for the bake-off against FlashHead on a single GPU. |
| 9 | [[InfiniteTalk]] | Long-form talking video | 7,956 | Apache-2.0 | Strong community traction for long clips. Check streaming latency before using for live; likely better for offline Berylize Creatives output. |
| 10 | [[Linly-Talker]] | Conversational WebUI | 3,455 | MIT | MIT-licensed integration example showing how to hot-swap backends. Useful for the Node Inspector 'one-click model swap' design. |

## Honorable mentions
- [[Duix-Avatar]] (15,639 stars, NOASSERTION): Offline avatar and voice-clone toolkit; most-starred in the topic but non-standard license, so audit first.
- [[LiteAvatar]] (482 stars, MIT): CPU-only real-time 2D audio-to-face avatar; backend for OpenAvatarChat. The floor of the cost curve.
- [[EchoMimic]] (4,307 stars, Apache-2.0): Editable-landmark audio-driven portrait animation (AAAI 2025).
- [[LatentSync]] (6,105 stars, Apache-2.0): Stable-Diffusion based lip sync, strong quality but heavier.
- [[Hallo3]] (1,406 stars, MIT): Dynamic, realistic portrait animation with video diffusion transformers.

Team shortlist context (what was kept or ruled out and why): [[EVE ECC Avatar Pipeline Research - Part 1]]. Combine with [[Top 25 Hugging Face Papers - Live Digital Humans]].
