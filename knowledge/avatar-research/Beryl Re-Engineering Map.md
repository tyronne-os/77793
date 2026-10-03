Beryl Live Human OS · Re-Engineering Map + Deployment Report

# Node arrangement, cold-start strategy, and BitNet impact

LiveAvatar (Alibaba-Quark, ECCV 2026 Spotlight) ships a render core with no live audio socket, no TTS, no verification, and no affordable single-GPU path. Every node below is either adopted from LiveAvatar directly, or built to close one specific gap in its own published roadmap. Sections below cover instance/model-loading strategy, measured-or-estimated deploy speed per node, and what Microsoft's BitNet quantization can and cannot do to this same pipeline.

**Figure 1 — Stock baseline vs. Beryl-engineered pipeline** scroll right on small screens

Figure 1. Top band: LiveAvatar exactly as its own roadmap ships it — a file-in/file-out render core with four checkboxes still unchecked. Bottom band: the same render core, adopted unmodified, wrapped by five new or repositioned components that close those checkboxes one-for-one — TTS, the live socket, per-block verification, and session-based GPU billing.

stock LiveAvatar — shipped, unmodified

existing Beryl signal path

new — closes a named roadmap gap

B.B.P verification check

GPU/infra layer

**Node roles and what each one re-engineers**

| Node | Role | Stock LiveAvatar state | What Beryl adds |
| --- | --- | --- | --- |
| **SoulX-Duplug 0.6B** | Listening / turn-taking classifier | Not present — LiveAvatar has no concept of listener statenot in scope | idle/nonidle/speak/blank feeds the brain before it ever calls the render core |
| **Qwen3-TTS 0.6B** | Voice synthesis | Roadmap item⬜ TTS integration | 97ms streaming latency, Apache-2.0, 9 timbres — feeds audio chunks straight into the wrapper |
| **Streaming Socket Wrapper** | Converts file-based `generate()` into live mic-in / frame-out | Roadmap item⬜ UI integration | chunks live audio into 48-frame blocks, calls the same `generate()` per block, streams frames as they finish |
| **LiveAvatar Core (adopted)** | Render — block-wise autoregressive avatar video | 45 FPS on 5×H800; single-GPU path unmeasured, labeled "offline" | unmodified weights, run on 1× spot L40S — the bake-off (LeapTalk vs. this) decides which stays |
| **daVinci SR modules** | Resolution uplift, 540p/1080p | Fixed 704×384 native, no upscale pathnot in scope | Apache-2.0 post-pass, domain-trained on portrait frames, \~1–3GB VRAM |
| **B.B.P Decider** | Per-block verification | No verification layer of any kindnot in scope | checks painted pixels of every 48-frame block before it streams — the exact fix for the ECC-5 MOTION failure (transform values ≠ pixels) |
| **Elana GPU Session Manager** | Spot-instance lifecycle, cost control | Assumes an always-on 48–80GB GPUnot in scope | session start on first audio frame, stop on silence — turns "always-warm" into "$0.31/hr while talking" |

## What stays exactly as LiveAvatar shipped it

The Wan2.2-S2V-14B weights, the 4-step DMD distillation, the block-wise autoregressive generation, streaming-VAE, and FP8 quantization are adopted `as-is`. No fork, no retrain. The only thing that changes around the core is everything the authors themselves left unchecked.

## Why per-block verification is new, not incidental

LiveAvatar generates in 48-frame blocks natively — that boundary already exists in the code. B.B.P attaches to it as a checkpoint nothing else in the field has: verify the block before it streams, not the finished clip after. Stock LiveAvatar has no equivalent hook.

## The one number that decides the render layer

Everything upstream and downstream of the core (Duplug, TTS, socket, SR, Decider, GPU session manager) is being built either way. What's still open is single-GPU FPS and first-frame latency for LiveAvatar vs. LeapTalk on the same spot L40S — the bake-off spec this diagram sets up.

**Deployment strategy — do you create a new instance and download the model every time?**

Short answer: **yes, a compute instance is created — no, the model does not download live.** The multi-gigabyte download only ever happens once, when the deployment image is built. Every session after that *attaches* to pre-loaded weights instead of fetching them — this is the fix for the cold-start problem raised earlier (LiveAvatar's 385ms first-frame delay, LeapTalk's UPON LOAD 3.77s). Two paths, run once vs. run every session:

✕ cold path — happens once, ever, during image build

### 1 · Provision build host

Any GPU or CPU box, temporary

\~1–2 min

→

### 2 · Pull weights from HF/NGC

All pipeline models, full-precision + quantized variants

10–20 min

→

### 3 · Bake into image / network volume

Container layer or persistent attached disk

2–5 min

→

### 4 · Push to registry

Image or volume snapshot, versioned

1–3 min

✓ warm path — happens every real session, this is what billing measures

### 1 · Spin up instance

Attach the pre-baked image/volume — no download

\~2–8s

→

### 2 · Load weights → VRAM

Disk/NVMe read into GPU memory, not network fetch

2–40s (size-dependent)

→

### 3 · Warm-up inference pass

Kernel compile, cache fill, first-frame render

0.4–3s

→

### 4 · "Hello"

Session live, billing clock starts here

total below ↓

The Elana GPU session manager owns step 1 of the warm path — it's the thing deciding when to attach an instance at all. Network-volume or baked-image storage (RunPod network volumes, Modal/Baseten cached images) is what makes step 1 seconds instead of minutes; without it, every session re-runs the cold path and the "$0.31/hr while talking" math from earlier breaks.

**Deploy speed, per node — download-to-"hello"** estimated from published weight sizes + typical cloud NVMe/network throughput — not vendor-benchmarked

| Node | Weights on disk | Cold — first-ever download + load | Warm — instance attach + VRAM load only |
| --- | --- | --- | --- |
| $0.40/hr tier — always-on capable |  |  |  |
| SoulX-Duplug 0.6B | \~1.2 GB | \~15–25s | \~1–2s |
| Qwen3-TTS-1.7B-CustomVoice | \~3.5 GB | \~30–60s | \~2–4s |
| SoulX-FlashHead-1.3B / LeapTalk | \~3–5 GB | \~40–80s | \~3–6s |
| B.B.P Decider-2B | \~4–5 GB | \~45–90s | \~3–5s |
| daVinci SR (540p module) | \~200–500 MB | \~5–10s | \<2s |
| small-tier stack, parallel load | \~2–3 min (sequential worst case) | **\~8–15s** |  |
| $0.70–1.50/hr tier — burst on demand |  |  |  |
| Hallo4 (WAN2.1-1.3B + VAE + T5 + audio enc.) | \~10–15 GB | \~2–4 min | \~8–15s |
| LiveAvatar FP8 (Wan2.2-S2V-14B) | \~14 GB | \~3–5 min | \~15–25s |
| LiveAvatar unquantized | \~28 GB | \~6–10 min | \~25–40s |
| B.B.P Decider-35b-a3b (NVFP4) | \~19.6 GB | \~3–6 min | \~15–25s |

cold path — never happens during a live session if images are pre-baked

warm path — the real per-session number

**BitNet (microsoft/BitNet) impact on this same pipeline** verified against the repo README before scoring each node

BitNet quantizes weights to \~1.58 bits (ternary: −1, 0, +1) instead of FP16's 16 bits — up to \~10× smaller in theory, with Microsoft's own published numbers showing **1.37×–6.17× inference speedup and 55–82% energy reduction on CPU**. The constraint that matters here: **BitNet requires native training or distillation into the 1.58-bit format — it cannot be applied post-hoc to an existing checkpoint.** It's proven on LLMs, embedding models, and one ASR engine (VibeASR.cpp). There is no published evidence of it working on diffusion or video-generation architectures.

| Node | Architecture | BitNet status | What would have to happen |
| --- | --- | --- | --- |
| **Nemotron + Memory (brain)** | LLM (transformer) | theoretically compatible | No BitNet-Nemotron checkpoint exists today — NVIDIA would need to natively retrain it. Not something Beryl can do to an existing model. |
| **B.B.P Decider (2B / 35B-A3B)** | LLM (Qwen3.5 base) | theoretically compatible | Same constraint — the Decider/Qwen team would need to ship a BitNet variant. `scripts/train.sh full` fine-tunes an existing checkpoint; it does not convert precision format. |
| **Qwen3-TTS (LM backbone)** | LLM-driven TTS | theoretically compatible | No BitNet-TTS release exists. The text/token backbone could in principle be retrained; the vocoder/audio decoder side is unproven regardless. |
| **SenseVoice / Whisper (STT)** | Speech recognition | closest to proven | BitNet's own repo lists a proven ASR case (VibeASR.cpp) — but that's a specific BitNet-native ASR model, not a retrofit of Whisper/SenseVoice itself. Swapping to it is a model substitution, not a quantization step. |
| **SoulX-Duplug (listening state)** | Small classifier | theoretically compatible | Already CPU-light at 0.6B — BitNet's real win is on much larger models; the payoff here is marginal even if a variant existed. |
| **SoulX-FlashHead / LeapTalk (render)** | Diffusion transformer | not applicable | No diffusion or video-generation model has a published BitNet conversion. Stays at current precision (FP16/lite mode). |
| **LiveAvatar core** | Diffusion transformer (14B DiT) | not applicable | Same — this is exactly the architecture class BitNet has never been demonstrated on. FP8 (already in use) is the real lever here, not BitNet. |
| **Hallo4 (render)** | Diffusion transformer (WAN2.1 base) | not applicable | Same constraint. DPO-alignment and 1.58-bit quantization are unrelated axes — nothing here blocks pairing FP8 Hallo4 with a future BitNet brain, just not a BitNet Hallo4. |
| **daVinci SR modules** | Convolutional/SR network | not applicable | Outside BitNet's demonstrated scope entirely. |

**Net effect on this pipeline today: none, deployably.** The VRAM-heavy nodes that actually decide your GPU tier — LiveAvatar, Hallo4, FlashHead/LeapTalk, daVinci SR — are all diffusion/vision architectures, exactly the class BitNet has not been shown to work on. The nodes BitNet *could* theoretically shrink (Nemotron, Decider, Qwen3-TTS) are comparatively small already (2–9B) and none has a released 1.58-bit checkpoint. BitNet is worth re-checking each time this pipeline is revisited — the repo is active — but it is not a lever available today, and it never touches the render layer regardless, since that's not what BitNet quantizes.

## What stays exactly as LiveAvatar shipped it

The Wan2.2-S2V-14B weights, the 4-step DMD distillation, the block-wise autoregressive generation, streaming-VAE, and FP8 quantization are adopted `as-is`. No fork, no retrain. The only thing that changes around the core is everything the authors themselves left unchecked.

## Why per-block verification is new, not incidental

LiveAvatar generates in 48-frame blocks natively — that boundary already exists in the code. B.B.P attaches to it as a checkpoint nothing else in the field has: verify the block before it streams, not the finished clip after. Stock LiveAvatar has no equivalent hook.

## B.B.P Decider — the fork itself

`tyronne-os/decider-plugin-brain-beryl` — fork of Mapika/decider, Apache-2.0, Qwen3.5-2B and 35B-A3B bases, already on GPU. Runs `POST /v1/systemone`, same endpoint shape as the TypeSafe SDK it replaces. This is the node every verification arrow in the diagram above points back to.

Beryl Re-Engineering Map + Deployment Report · v2 · LiveAvatar (Apache-2.0, ECCV 2026 Spotlight) adopted unmodified as render core · deploy-speed figures are engineering estimates, not vendor benchmarks · BitNet (microsoft/bitnet) verified not applicable to any render-layer node today · tyronne-os/decider-plugin-brain-beryl