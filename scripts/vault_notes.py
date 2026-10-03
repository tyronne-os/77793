"""Hand-written concept, playbook and persona notes for the Second Brain vault.

Numbers marked (target) are engineering budgets to tune by measurement, not benchmarks.
Numbers marked (research) come from the team's own Sep 2026 reports in knowledge/research.
"""

CONCEPTS = {
"Live Avatar Pipeline": (["hub", "pipeline"], """
The loop: **mic -> [[Streaming ASR and Semantic VAD]] -> [[Conversation Brain and RAG]] -> [[Streaming TTS]] -> audio-driven render ([[Autoregressive Streaming Diffusion]] or [[Audio-Driven Motion Latents]]) -> [[WebRTC Delivery]] -> screen**, with [[Turn-Taking and Full-Duplex]] running beside it and a [[Verification Layer]] checking what was actually painted.

Two planes (from [[Beryl OS Pipeline v0.2]]):
- **Control plane** answers in under 1 s, always: presence, state, routing. Never blocks on the GPU.
- **Data plane** (render, TTS, SR) may warm up cold, but must hit the [[Latency Budget]] once hot.

Stages in the Beryl Mastering Suite: L0 Idle Presence, L1 Audio2Face / live render, L2 cinematic (Omniverse). Progressive: L0 -> L1 -> L2.

Design rule: assembling components and making them behave as one living thing are different problems ([[EVE ECC Avatar Pipeline Research - Part 1]]). Own the signal contracts between nodes.

Start with [[Playbook - Build a Live Avatar Pipeline]]; when something is broken use [[Playbook - Repair a Broken Avatar Pipeline]].
"""),
"Latency Budget": (["latency", "pipeline"], """
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
"""),
"Uncanny Valley": (["quality", "realism"], """
The uncanny valley in live avatars is mostly **timing and coherence**, not pixel quality. Checklist of what viewers detect:
1. **Audio-visual sync**: lips off by more than about 45 ms early or 125 ms late are noticeable (ITU-R BT.1359 detectability thresholds, approximate).
2. **Dead eyes**: blink roughly every 3-5 s with irregular timing, ~100-150 ms duration; gaze must saccade and look at the camera with natural aversion, not stare.
3. **Listening stillness**: frozen faces while the user talks are the biggest tell. See [[Listening Behavior]].
4. **Expression/voice mismatch**: smile in the eyes (cheek raise) must match prosody. See [[Emotion and Expression Control]].
5. **Identity drift and flicker** over long streams: see [[Exposure Bias and Identity Drift]], [[Long-Horizon Memory]].
6. **Rigid head and torso**: micro head motion, breathing, shoulder movement; half-body models like [[MirrorMe - 2506.22065]] help.
7. **Over-smooth skin / 'AI gloss'**: preserve texture; avoid heavy SR smoothing.
8. **Verification gap**: a 96/100 score on the wrong metric produced a 'blinking portrait' ([[EVE ECC Avatar Pipeline Research - Part 1]]). Verify painted pixels, see [[Verification Layer]].

Run [[Playbook - Uncanny Valley Audit]] before showing anyone.
"""),
"Turn-Taking and Full-Duplex": (["conversation", "audio"], """
Half-duplex (wait for silence, then answer) feels like a walkie-talkie. Natural conversation is **full-duplex**: both sides can speak, overlap, backchannel ('mm-hm'), and interrupt.

Practical stack for an avatar:
- Semantic turn detector (SoulX-Duplug 0.6B in Beryl: idle / nonidle / speak / blank) instead of a raw silence timer, see [[Streaming ASR and Semantic VAD]].
- [[Barge-In]]: when the user speaks over the avatar, cut TTS within ~200 ms and flip the face to listening.
- [[Listening Behavior]]: face keeps reacting while the user talks.
- True end-to-end full-duplex models exist ([[OmniFlatten - 2410.17799]]) but cascaded designs ([[FireRedChat - 2509.06502]]) are easier to debug and swap.
Measure with [[Full-Duplex-Bench - 2503.04721]]: pause handling, backchannel, turn-taking, interruption.
"""),
"Barge-In": (["conversation", "audio"], """
Barge-in = the user interrupts the avatar. Requirements: (1) detect user speech while TTS plays, with echo cancellation so the avatar's own voice is not mistaken for the user; (2) stop audio and render stream immediately, flush queued TTS and queued video blocks; (3) tell the LLM what was actually spoken (truncate the assistant message at the interruption point); (4) switch the face to listening within one frame block. Failure modes: avatar keeps talking for a second after interruption (stale queue), or false barge-in from background noise (add a minimum duration plus semantic check). Details in [[Turn-Taking and Full-Duplex]].
"""),
"Listening Behavior": (["conversation", "expression"], """
Listening is where most avatars fall into the uncanny valley. A listening face needs: gaze that returns to the speaker, small nods timed to prosodic boundaries, brow raises on emphasis, mirrored affect (smile when the user smiles), occasional blinks and micro-motion, and backchannel sounds at pause points.

Approaches in the literature: generate listener motion from the user's audio ([[INFP - 2412.04037]], [[UniLS - 2512.09327]]), condition on conversational context and emotion ([[ECHO - 2603.17427]]), adapt online ([[EvolvingAvatar - 2609.35616]]), or optimize preferences for reactive expressiveness ([[Avatar Forcing - 2601.00664]]). Cheap fallback: L0 idle presence loop from the [[Live Avatar Pipeline]] triggered by listener state, with intensity driven by user audio energy.
"""),
"Autoregressive Streaming Diffusion": (["diffusion", "render"], """
Instead of generating a whole clip, generate video in short **blocks** conditioned on audio and previously generated frames, so the first frame appears quickly and the stream can run indefinitely. Key ingredients: causal or block-causal attention, KV cache of previous blocks ([[Long-Horizon Memory]]), few-step distillation ([[Distillation and Quantization]]) down to 1-4 steps, and defenses against error accumulation ([[Exposure Bias and Identity Drift]]). Throughput must exceed playback fps with headroom; pipeline parallelism across GPUs is how 14B models reach real-time ([[Live Avatar - 2512.04677]]), while 1.3B models do it on a single card ([[SoulX-FlashHead]]). Block size sets the minimum added latency; see [[Block-wise Generation]].
"""),
"Exposure Bias and Identity Drift": (["diffusion", "quality"], """
In autoregressive generation the model is trained on clean history but at inference conditions on its own imperfect output, so small errors compound: skin tone shifts, face morphs, colors saturate, mouth shapes degrade. Fixes seen in the papers: self-forcing / diffusion forcing style training, sliding-window local-future denoising ([[AvatarForcing One-Step - 2603.14331]]), bidirectional self-correcting distillation ([[SoulX-FlashTalk - 2512.23379]]), anchoring on a reference or sink frame ([[Live Avatar - 2512.04677]]), memory modules ([[MEMO - 2412.04448]]). Operational mitigations: periodic re-anchor to the source portrait, limit session length, monitor drift with a face-identity embedding distance and alert via the [[Verification Layer]].
"""),
"Long-Horizon Memory": (["diffusion", "render"], """
Minutes-to-hours streams need bounded memory. Techniques: rolling sink frame (always keep the reference frame in attention), bounded KV caches, compressed or convolutional KV memory ([[SoulX-LiveAct - 2603.11746]]), unbounded rotary position encoding ([[JoyAvatar - 2512.11423]]), memory-guided diffusion ([[MEMO - 2412.04448]]). Trade-off: bigger cache = better consistency but more VRAM and latency. Related: [[Exposure Bias and Identity Drift]].
"""),
"Audio-Driven Motion Latents": (["render", "diffusion"], """
Instead of diffusing pixels, predict a compact **motion representation** (keypoints, 3DMM/FLAME coefficients, motion latents) from audio, then render with a fast warping/rendering network. Much cheaper and more controllable (head pose, emotion, gaze) than pixel diffusion. Examples: [[FLOAT - 2412.01064]] (flow matching in motion latent space), [[Ditto - 2411.19509]] (explicit motion space), [[UniLS - 2512.09327]]. Weakness: detail like hair and teeth depends on the renderer. Good candidate for the affordable tier in [[Playbook - Affordable and Profitable Deployment]].
"""),
"ARKit Blendshapes": (["3d", "expression"], """
52 standard facial coefficients (eyeBlink_L/R, jawOpen, mouthSmile_L/R, browInnerUp, cheekPuff, noseSneer_L/R ...) used by rigged 3D avatars and by Audio2Face-3D. The Mastering Suite displays them live. Use when the target is a rigged mesh, a game engine, or Gaussian-splat avatars ([[Gaussian Splatting Avatars]]); the team's photo-in pipeline deliberately avoids a mesh ([[EVE ECC Avatar Pipeline Research - Part 1]]) but blendshape-style readouts remain useful as a **telemetry and test signal** for [[Visemes and Lip Sync]].
"""),
"Visemes and Lip Sync": (["audio", "expression"], """
A viseme is the mouth shape for a group of phonemes (about 15 classes cover English). Two routes: phoneme/viseme timeline from TTS, or end-to-end audio-to-motion models that never expose visemes. Check: closed-lip bilabials (p, b, m), labiodentals (f, v) with lip-teeth contact, and rounded vowels (oo, oh). Common bug: audio and video clocks drift, so lips slowly desync; share one clock and timestamp every audio chunk and frame. Sync thresholds are in [[Uncanny Valley]]. Lip-sync-only tools: [[MuseTalk]].
"""),
"Streaming TTS": (["audio"], """
Needs first-audio under ~200 ms and chunked output so rendering can start before the sentence finishes. Qwen3-TTS 0.6B (Apache-2.0, 9 timbres, ~97 ms streaming latency per [[Beryl Re-Engineering Map]]) and Kokoro 82M (local, voice cloning in the CRANE backend) are the nodes in this stack. Flush text to TTS at clause boundaries, keep prosody consistent across chunks, and return word/phoneme timings if possible for [[Visemes and Lip Sync]]. Voice and face emotion must agree: [[Emotion and Expression Control]].
"""),
"Streaming ASR and Semantic VAD": (["audio", "conversation"], """
Streaming ASR gives partial transcripts so the LLM can begin early; a **semantic VAD** decides whether a pause is a turn end or a thinking pause (a plain silence timer cuts people off or adds dead air). Riva ASR (gRPC, ~100 ms) and SoulX-Duplug 0.6B (idle/nonidle/speak/blank) appear in the Beryl pipeline ([[Beryl Re-Engineering Map]]). Add echo cancellation for [[Barge-In]]. Framework options: [[Pipecat]], [[LiveKit Agents]].
"""),
"WebRTC Delivery": (["delivery", "latency"], """
Browser delivery: send encoded video plus audio over WebRTC with a small jitter buffer; signaling, ICE, STUN/TURN. Sub-100 ms network latency requires regional placement and TURN fallback. Keep audio and video in one RTP session so the browser keeps lip sync. Frameworks that already solve this: [[LiveKit Agents]], [[Pipecat]]; NVIDIA reference in [[Tokkio Guide Map]]. Encode on GPU (NVENC) to avoid CPU bottlenecks. Part of the [[Latency Budget]].
"""),
"Cost Ceiling and GPU Session Economics": (["cost", "business"], """
Team ceiling (research): about **$0.40/hr, GPU-resident** (GCP L4 g2-standard-4 today; $240 GCP credits expire 2026-11-01). Frontier-scale models (14B-22B on 5-8 H800/H200) are out for the product but fine for quality references. Levers:
- Pick a 1.3B-class core ([[SoulX-FlashHead]]) on one 4090/L4/L40S.
- **Session-based billing** (Elana GPU Session Manager): start on first audio frame, stop on silence; spot instances ~$0.31/hr while talking ([[Beryl Re-Engineering Map]]).
- Multiple concurrent streams per GPU (FlashHead reports 3 streams at 25+ fps on one 4090).
- Offload rendering to the viewer for 3DGS avatars ([[TaoAvatar - 2503.17032]]).
- Route batch/creative jobs to ZeroGPU rather than the live node ([[Berylize Creatives]]).
Revenue side in [[Playbook - Affordable and Profitable Deployment]]. Related: [[Cold Start Strategy]], [[Licensing Audit]].
"""),
"Licensing Audit": (["business", "risk"], """
A model with Apache-2.0 at the root can still depend on a restrictive component. The team audited the whole dependency tree (research Part 1): Gemma Terms of Use require passing use restrictions to end users; Stability AI Community License is free only under $1M revenue; some stacks split licenses (weights community-licensed, renderer non-commercial, InsightFace research-only); some repos have no LICENSE file. Process: read LICENSE files, check weights license separately from code, check every pretrained dependency (face detectors, VAEs, text encoders), record it in the repo note. Apache-2.0/MIT/BSD with clean trees were the 'keep' list: [[SoulX-FlashHead]], [[Ditto]], [[Pipecat]]. Flag unknowns such as [[MuseTalk]]. Matters for [[Playbook - Affordable and Profitable Deployment]].
"""),
"Verification Layer": (["quality", "reliability"], """
Principle from the team research: **verify what is painted, not what the code says it painted.** The old MOTION check read transform values and passed a face hidden behind an opaque layer. Decider / JEV style System-One classifiers return a typed decision plus calibrated confidence in ~70-500 ms and can run every block:
- proprioception: {stated_stage, telemetry_stage, consistent, confidence}
- motion: {is_motion_visible, occluding_layer}
- listening cross-check: {duplug_state, audio_energy_pattern, agrees}
Hook it at the 48-frame block boundary ([[Block-wise Generation]]) so bad blocks are caught before streaming. See [[Beryl OS Pipeline v0.2]] and [[Beryl Live Human OS - Realism, Consciousness and JEV - Part 2]]. Pair with [[Full-Duplex-Bench - 2503.04721]] style tests.
"""),
"Emotion and Expression Control": (["expression", "realism"], """
Expression has three layers: (1) low-level lip/jaw from audio; (2) paralinguistic expression from prosody (brows, cheeks, head); (3) intent-level emotion from the LLM (concerned, amused). Layers 2-3 are where realism lives. Methods: emotion-aware diffusion ([[MEMO - 2412.04448]]), motion-latent emotion control ([[FLOAT - 2412.01064]]), long-range acting ([[X-Actor - 2508.02944]]), gestures ([[EMO2 - 2501.10687]]), preference optimization ([[Avatar Forcing - 2601.00664]]). Let the LLM emit a light affect tag per clause that the renderer and TTS both consume so face and voice agree ([[Streaming TTS]]).
"""),
"Block-wise Generation": (["render", "latency"], """
LiveAvatar-style 48-frame blocks: generate, stream, repeat. Block length is the latency floor and the natural **checkpoint** for verification, barge-in cut points and audio chunking. The streaming socket wrapper in the Beryl design turns a file-in/file-out `generate()` into live mic-in/frame-out by chunking audio into blocks ([[Beryl Re-Engineering Map]]). Related: [[Autoregressive Streaming Diffusion]], [[Verification Layer]], [[Barge-In]].
"""),
"Distillation and Quantization": (["diffusion", "cost"], """
Make heavy diffusion cheap: step distillation (4-step DMD, 1-NFE LoRA like LeapTalk), FP8 or INT8 weights, cached static features ([[RAP - 2508.05115]]), preference distillation ([[Hallo-Live - 2604.23632]]). Always re-test quality after quantization (skin texture and teeth first). BitNet-style 1.58-bit does not cleanly apply to the diffusion core, see [[Beryl Re-Engineering Map]]. Supports [[Cost Ceiling and GPU Session Economics]].
"""),
"Cold Start Strategy": (["cost", "latency"], """
Download weights once into an image or network volume; every session attaches pre-loaded weights. Keep the control plane warm (<1 s) and warm data-plane nodes progressively (L0 -> L1 -> L2). Do not run in dev mode: the Mastering Suite flagged a 3.77 s load caused by Vite dev-mode ([[TESTING LIVE AVATAR EVE PIPELINE]]). Spot instance start plus attach should be minutes at most, so show L0 idle presence while data nodes warm ([[Live Avatar Pipeline]]). See [[Cost Ceiling and GPU Session Economics]].
"""),
"Conversation Brain and RAG": (["brain", "conversation"], """
The brain decides what to say and how to feel about it. Requirements: streaming tokens, short spoken-style answers, persona consistency, memory, tool use, retrieval from a knowledge base with intent routing ([[Hi-Reco - 2511.12662]]), and an affect tag for the face ([[Emotion and Expression Control]]). In CRANE this vault is Berylize's second brain: retrieval is BM25 plus Obsidian link-graph expansion; it supplements, never replaces, the model's own knowledge ([[Berylize Persona]]). NVIDIA reference: ACE Agent in [[Tokkio Guide Map]].
"""),
"Gaussian Splatting Avatars": (["3d", "render"], """
3D Gaussian Splatting avatars are rendered on-device in real time from a captured/rigged identity, driven by blendshape-like coefficients ([[ARKit Blendshapes]]). Pros: near-zero server GPU, very stable identity, full-body possible ([[TaoAvatar - 2503.17032]]). Cons: needs capture and rigging per identity, less 'photo-in' flexibility. Use as the cost-floor tier in [[Playbook - Affordable and Profitable Deployment]].
"""),
}

PLAYBOOKS = {
"Playbook - Build a Live Avatar Pipeline": (["playbook", "build"], """
Goal: photo in, a face that listens and answers live, under budget.
1. **Constraints first**: cost ceiling, hardware, license policy ([[Cost Ceiling and GPU Session Economics]], [[Licensing Audit]]). Eliminate candidates before benchmarking.
2. **Pick the render core** with a bake-off on the target GPU: first-frame latency, sustained fps with headroom, identity drift at 5 min, listening quality. Default shortlist: [[SoulX-FlashHead]], [[Ditto]], then quality tier [[SoulX-FlashTalk]].
3. **Audio side**: semantic VAD + streaming ASR ([[Streaming ASR and Semantic VAD]]), streaming TTS ([[Streaming TTS]]); consider [[Pipecat]] or [[LiveKit Agents]] instead of hand-rolling.
4. **Brain**: persona, short spoken answers, affect tags ([[Conversation Brain and RAG]]).
5. **Glue**: one shared clock, block-wise streaming socket ([[Block-wise Generation]]), explicit node contracts (input, output, port, latency budget) as in the Mastering Suite.
6. **Delivery**: [[WebRTC Delivery]].
7. **Presence before data**: L0 idle loop + [[Listening Behavior]] so the face is alive while models warm ([[Cold Start Strategy]]).
8. **Verify**: [[Verification Layer]] on painted pixels, then [[Playbook - Uncanny Valley Audit]].
9. **Cost controls**: session start/stop, concurrency, ZeroGPU for batch ([[Playbook - Affordable and Profitable Deployment]]).
Reference architectures: [[Tokkio Guide Map]] (NVIDIA), [[Beryl OS Pipeline v0.2]], [[Beryl Re-Engineering Map]], [[OpenAvatarChat]].
"""),
"Playbook - Repair a Broken Avatar Pipeline": (["playbook", "debug"], """
Diagnose by symptom, narrowing to one node using per-node health, ports and timestamps.
| Symptom | Likely cause | Check / fix |
|---|---|---|
| Face frozen / blinking portrait | Render not painting (transform-only layer, occluded) | [[Verification Layer]] motion check on real pixels; confirm model output reaches the canvas |
| No video, audio ok | WebRTC track failure, encoder crash | ICE state, TURN, encoder logs; [[WebRTC Delivery]] |
| Lips drift out of sync over time | Separate audio/video clocks | Single media clock, timestamps per chunk; [[Visemes and Lip Sync]] |
| Long pause before answer | A hop over budget | [[Playbook - Latency Debugging]] |
| Interrupt ignored / avatar talks over user | Stale queues, no echo cancel | [[Barge-In]] flush logic |
| Avatar cut off mid-thought | VAD timer too aggressive | Semantic VAD, [[Turn-Taking and Full-Duplex]] |
| Face morphs/colors shift after minutes | [[Exposure Bias and Identity Drift]] | Re-anchor, shorter windows, sink frame |
| Says 'I'm at L0' while in L1 | Stated vs telemetry mismatch (proprioception) | Verification proprioception check ([[Beryl Live Human OS - Realism, Consciousness and JEV - Part 2]]) |
| First load 3+ s | Dev build, cold weights | Production build, preloaded weights ([[Cold Start Strategy]]) |
| CUDA OOM | Model + KV cache + SR too big | Lower res, FP8, bounded KV ([[Long-Horizon Memory]], [[Distillation and Quantization]]) |
| Node offline in Backend panel | Tunnel/port down | Re-open SSH tunnel (8010 LLM, 8011 creatives, 8012 TTS), check `vllm` unit |
Method: reproduce, isolate one node with its Test button, measure, fix, add a regression check to the verification layer.
"""),
"Playbook - Uncanny Valley Audit": (["playbook", "quality"], """
Run with the sound off, then with sound, then while *you* talk to it.
1. Sound off, 60 s: does the face look alive while idle? blink cadence, breathing, micro-motion, gaze.
2. Sound on, lip sync: closed lips on p/b/m, f/v contact, sync within thresholds ([[Visemes and Lip Sync]]).
3. You speak, avatar listens, 60 s: reactions, nods, gaze return ([[Listening Behavior]]).
4. Interrupt it mid-sentence ([[Barge-In]]).
5. Emotional range: happy, concerned, neutral sentences; does face match voice ([[Emotion and Expression Control]])?
6. 10-minute soak: identity drift, flicker, color shift ([[Exposure Bias and Identity Drift]]).
7. Static frame review: teeth, skin texture, eye catchlights, hairline, ear and neck edges.
8. Score each item pass/fail with a screenshot; never rely on a single aggregate number ([[Verification Layer]]).
Full cause list in [[Uncanny Valley]].
"""),
"Playbook - Affordable and Profitable Deployment": (["playbook", "business"], """
Affordable: choose the cheapest tier that passes the audit.
| Tier | Approach | Cost shape |
|---|---|---|
| Floor | 3DGS on-device ([[Gaussian Splatting Avatars]]) or CPU 2D ([[LiteAvatar]]) | near-zero server GPU |
| Core | 1.3B real-time on L4/4090 ([[SoulX-FlashHead]], [[Ditto]]) | ~$0.31-0.40/hr only while a session is live |
| Premium | 14B pipeline-parallel ([[SoulX-FlashTalk]], [[LiveAvatar]]) | multi-GPU, offline or high-ticket only |
Profit levers: session-gated billing ([[Cost Ceiling and GPU Session Economics]]); several streams per GPU; cheap per-turn verification instead of LLM judges; clean licenses so you can charge ([[Licensing Audit]]); batch creative output via ZeroGPU ([[Berylize Creatives]]).
Product shapes that tolerate current quality and pay: customer service, tutors, concierge, onboarding, companions with a human face. Charge per minute of live session with a floor, price above GPU cost x utilization buffer.
Dependability: health checks per node, auto-fallback (NIM / ZeroGPU), idle shutdown, session recording of latency stats ([[Playbook - Repair a Broken Avatar Pipeline]]).
"""),
"Playbook - Latency Debugging": (["playbook", "latency"], """
1. Put timestamps on a shared clock at: speech end, ASR final, LLM first token, TTS first chunk, render first frame, frame displayed.
2. Compute each hop; compare to [[Latency Budget]].
3. Typical culprits: endpointing timer too long; LLM waiting for a full sentence; TTS not streaming; render not warmed or in dev mode ([[Cold Start Strategy]]); too many diffusion steps ([[Distillation and Quantization]]); large block size ([[Block-wise Generation]]); network/TURN relay ([[WebRTC Delivery]]); Python GIL or sync I/O in the control plane.
4. Fix the largest hop first; re-measure; keep a latency regression test.
5. Mask what you cannot fix: instant listening reaction, a filler/backchannel, and L0 idle presence ([[Live Avatar Pipeline]]).
"""),
}
