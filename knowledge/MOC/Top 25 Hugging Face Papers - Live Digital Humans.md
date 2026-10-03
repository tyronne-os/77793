---
type: index
tags: [index, papers, avatar]
retrieved: 2026-10-02
---

# Top 25 Hugging Face Papers - Live Digital Humans

Goal: live digital humans with **no uncanny valley**, **maximum human expression**, **bi-directional conversation**, **audio-driven diffusion**, built **affordably, profitably, dependably**.

Method: curated on 2026-10-02 from Hugging Face paper searches (audio-driven talking head, streaming interactive avatars, full-duplex dialogue, emotion/expression, listener generation). Ranked by fit to the goal above, not by an official Hugging Face ranking; upvotes are shown only as a community signal.


## Streaming core

| # | Paper | Published | Upvotes | Takeaway |
|---|---|---|---|---|
| 1 | [[Live Avatar - 2512.04677\|Live Avatar]] | 2025-12 | 133 | 14B diffusion model for real-time, infinite-length audio-driven avatars |
| 2 | [[SoulX-FlashTalk - 2512.23379\|SoulX-FlashTalk]] | 2025-12 | 3 | 14B system for high-fidelity real-time audio-driven avatars: bidirectional attention, error-correction, hardware-accelerated inference |
| 3 | [[AvatarForcing One-Step - 2603.14331\|AvatarForcing One-Step]] | 2026-03 | 14 | One-step streaming avatars |
| 4 | [[JoyAvatar - 2512.11423\|JoyAvatar]] | 2025-12 | 1 | Real-time infinite audio-driven avatar via progressive step bootstrapping, motion condition injection, unbounded rotary positional encoding |
| 5 | [[SoulX-LiveAct - 2603.11746\|SoulX-LiveAct]] | 2026-03 | 0 | Hour-scale real-time human animation: Neighbor Forcing and structured ConvKV memory make autoregressive diffusion scale |
| 6 | [[Omni-LiveAvatar - 2608.13602\|Omni-LiveAvatar]] | 2026-08 | 0 | Joint audio-video avatar generation in real time for minutes at a time via progressive autoregressive distillation and rolling prompt planning |
| 7 | [[Hallo-Live - 2604.23632\|Hallo-Live]] | 2026-04 | 1 | Streaming dual-stream diffusion for text-driven joint audio-video avatars with preference-guided distillation |

## Bi-directional conversation

| # | Paper | Published | Upvotes | Takeaway |
|---|---|---|---|---|
| 8 | [[Avatar Forcing - 2601.00664\|Avatar Forcing]] | 2026-01 | 58 | Real-time interactive head avatar using diffusion forcing, with label-free preference optimization for expressive motion at low latency |
| 9 | [[INFP - 2412.04037\|INFP]] | 2024-12 | 0 | Audio-driven head generation for dyadic conversation: the agent alternates between speaking and listening driven by both parties' audio |
| 10 | [[UniLS - 2512.09327\|UniLS]] | 2025-12 | 0 | Unified speak-listen facial expression from dual-track audio; two-stage training learns internal motion priors to solve listener-motion generation |
| 11 | [[ECHO - 2603.17427\|ECHO]] | 2026-03 | 0 | Interactive head generation with long-range conversational context and spatially aware decoupled cross-attention modulation |
| 12 | [[EvolvingAvatar - 2609.35616\|EvolvingAvatar]] | 2026-09 | 3 | Interactive 3D head generator whose parameters adapt during the conversation, coordinating speaking and listening motion |

## Expression and realism

| # | Paper | Published | Upvotes | Takeaway |
|---|---|---|---|---|
| 13 | [[FLOAT - 2412.01064\|FLOAT]] | 2024-12 | 47 | Flow matching in a learned motion latent space with a transformer vector-field predictor; temporally consistent and emotion-enhanced talking portraits |
| 14 | [[EMO2 - 2501.10687\|EMO2]] | 2025-01 | 15 | Generates expressive facial expression and hand gestures: audio-to-hand-pose first, then a diffusion model synthesizes the video |
| 15 | [[MEMO - 2412.04448\|MEMO]] | 2024-12 | 9 | Memory-guided emotion-aware diffusion: lip sync, long-term identity consistency, expression aligned to audio emotion |
| 16 | [[X-Actor - 2508.02944\|X-Actor]] | 2025-08 | 0 | Two-stage: audio-conditioned autoregressive diffusion for long-range expressive motion, then a diffusion video synthesis module |

## Real-time and affordable

| # | Paper | Published | Upvotes | Takeaway |
|---|---|---|---|---|
| 17 | [[LLIA - 2506.05806\|LLIA]] | 2025-06 | 2 | Diffusion-based audio-driven portrait video at real-time speed and low latency aimed at interactive virtual humans |
| 18 | [[RAP - 2508.05115\|RAP]] | 2025-08 | 4 | Real-time audio-driven portrait animation on a video DiT: hybrid attention for audio control and fidelity, static-dynamic training-inference paradigm |
| 19 | [[Ditto - 2411.19509\|Ditto]] | 2024-11 | 3 | Diffusion over an explicit motion space with an optimized inference pipeline (audio features, motion generation, rendering) for controllable real-time synthesis |
| 20 | [[MirrorMe - 2506.22065\|MirrorMe]] | 2025-06 | 0 | Real-time audio-driven half-body animation with a diffusion transformer; identity consistency, audio sync, progressive training |
| 21 | [[TaoAvatar - 2503.17032\|TaoAvatar]] | 2025-03 | 27 | Lightweight 3DGS full-body talking avatar running in real time across devices; distillation for non-rigid deformation |

## Conversation brain and speech

| # | Paper | Published | Upvotes | Takeaway |
|---|---|---|---|---|
| 22 | [[Hi-Reco - 2511.12662\|Hi-Reco]] | 2025-11 | 0 | Conversational digital human system: retrieval-augmented dialogue generation, history augmentation, intent-based routing |
| 23 | [[OmniFlatten - 2410.17799\|OmniFlatten]] | 2024-10 | 18 | Full-duplex spoken dialogue GPT: multi-stage post-training that fuses speech and text without changing the base architecture |
| 24 | [[Full-Duplex-Bench - 2503.04721\|Full-Duplex-Bench]] | 2025-03 | 4 | Benchmark for pause handling, backchanneling, turn-taking, and interruption management |
| 25 | [[FireRedChat - 2509.06502\|FireRedChat]] | 2025-09 | 0 | Modular full-duplex voice system: turn-taking controller, interaction module, dialogue manager; cascaded and semi-cascaded variants |

## How to use this list
- Building a core: read Streaming core, then [[Playbook - Build a Live Avatar Pipeline]].
- Making it feel alive: Bi-directional conversation + Expression and realism, then [[Playbook - Uncanny Valley Audit]].
- Keeping it cheap: Real-time and affordable, then [[Playbook - Affordable and Profitable Deployment]].
- Team constraints that filter this list: [[EVE ECC Avatar Pipeline Research - Part 1]].
