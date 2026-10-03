---
type: research
source: user-compiled PDF (Sep 21 2026)
tags: [research, avatar, user-authored]
---
# EVE ECC Avatar Pipeline Research (Part 1)

Related: [[Licensing Audit]] · [[Cost Ceiling and GPU Session Economics]] · [[SoulX-FlashHead]] · [[Beryl Re-Engineering Map]] · [[Live Avatar Pipeline]]

> Text extracted from the original PDF in `_attachments/`; tables are flattened.

Untitled

EVE ECC — Avatar Pipeline Research Report
Sep 21, 2026

1. Where we are
Repository: tyronne-os/eve-ecc , branch main , last commit 13167ce (Aug 8, 2026,
23:50 CDT) — "docs: the orchestration pivot — read before touching the avatar pipeline."
Working tree clean, no open PRs or issues. The project went quiet for roughly six weeks
after that commit; a DNS man-in-the-middle attack on the user's machine forced a full
local wipe. On resuming (Sept 21), repo integrity was verified directly against GitHub —
local HEAD matches remote exactly, git fsck clean, no secrets in any commit history,
.env never tracked. The repo itself was never touched by the attack; only the local

machine was.
The state the last commit left us in. The team had built a CSS-based "life layer" on EVE's
static portrait — parallax depth, a breath curve, hair lag, a masked eyelid sweep — and it
scored 96/100 on the project's own Realness Index. The director looked at it and said: "It is
not alive — this is a blinking portrait." He was right, and the pivot doc names two failures
rather than softening them:
Cosmetics mistaken for science. Transform math on a flat photograph is theater. Real
motion from a 2D image requires a model that actually drives facial geometry —
diffusion-based portrait animation — not CSS pretending to.
A high score on the wrong metric, called the worse failure of the two. The
certification's MOTION pillar read transform values instead of what was actually
painted on screen, and passed dead output twice — once while depth layers animated
perfectly behind an opaque portrait, 100% correct and 100% invisible.
The reframe that came out of that night: "Assembling and connecting, when it comes to
building a human avatar, are unrelated problems." Every component already existed —
NIM endpoints, Nemotron, a live cortex, a persona, a phoneme pipeline — but nothing
owned making them behave as one living thing. The original plan to fix this was purely
architectural: adopt Microsoft Agent Framework (Magentic as supervisor, Handoff for
node-to-node signal-path conversation, Group Chat for diagnosis quorum) on top of the
existing services/ace-controller , which already exposes /v1/nodes/{id}/converse ,
/v1/speak , and /v1/report .
---

Where this research extends that plan. Re-opening the project surfaced a second,
equally real gap sitting underneath the orchestration one: the render pipeline itself —
Audio2Face-3D → AnimGraph → Omniverse Stream — is a rigged-mesh pipeline that was
never actually reachable (hosted Maxine endpoints 404'd) and was the wrong tool for a
2D photograph regardless. So the research below runs in parallel to the orchestration
work: not a replacement for the Magentic/Handoff plan, but the missing answer to what
the render node in that graph should actually be.

2. What we're researching, and why
The brief has four hard constraints, and each one eliminated a large share of what's out
there:
1. Cost ceiling: ~$0.40/hr, GPU-resident, always warm. Not "cheap to run once" — the
model has to stay loaded and hot so the avatar is alive the instant the page loads, with
headroom to spare rather than compute maxed out just reaching real-time. This ruled out
almost every model trained at frontier scale (14B–22B parameters, 5–8 H800/H200 GPUs)
regardless of how good its numbers were.
2. No mesh, no rig, no gaming pipeline. The ask is a single 2D photograph in, 3D-aware
motion out — real head rotation, parallax, occlusion — not a literal reconstructed 3D
asset. This is a deliberate rejection of the Audio2Face-3D-style pipeline already sitting in
the repo's node graph, and it also ruled out the explicit-3D-reconstruction papers found
during research (they solve a different problem, at a different speed, discussed in section
3).
3. Maximum realism and conversational awareness, live. Not just speaking — listening
has to read as alive too, which is a much rarer property to find shipped in open work than
lip-sync is.
4. Build on successful open-source work with integrity, without acquiring liability. The
user, running what amounts to a stealth lab with full NVIDIA Enterprise/NGC backing, was
explicit about wanting to credit and build on real prior work rather than start from zero or
attempt to reproduce a paper cold — and wanted the chosen foundation permissive
enough that further open-source components could be merged into it later without one of
them quietly attaching a copyleft or field-of-use obligation to the whole product. That
turned "pick a license" into "audit the dependency tree," which is where several models
that looked clean at the top level turned out not to be (section 3).
---

A fifth constraint shaped the search without being stated outright: the user already holds
NVIDIA Enterprise and NGC access, which is not nothing — NVIDIA's Audio2Face-2D
("Speech Live Portrait") NIM does exactly the photo-plus-audio job being searched for,
and turned out to be sitting in the user's own entitlements the whole time, unreachable in
the original attempt only because the earlier team tried to hit hosted Maxine endpoints
that 404'd rather than pulling the NGC container directly.

3. The shortlist
Every entry below was checked against source — cloned from GitHub and read directly
where possible, since this session's network policy blocks huggingface.co and arxiv.org
(an allowlist gap, unrelated to the earlier attack, not yet corrected). License claims are
LICENSE-file-verified unless noted; hardware claims are README-stated unless noted as
code-derived.
Project

Date

License

Hardware for real-time

Verdict

SoulXFlashHeadLite (1.3B)

Feb 2026

Apache-2.0, clean
dependency tree
(verified)

1× RTX 4090 @ 96 FPS, or 3
concurrent streams @ 25+ FPS

Kept —
foundation

LeapTalk
(LoRA on
FlashHead)

Jul 2026

Apache-2.0, clean
dependency tree
(verified)

Same base; 1 NFE, up to 200
FPS claimed in "Lite" setting
(unverified on real hardware)

Kept — render/UI
layer

SoulX-Duplug
(0.6B)

Mar–Jul
2026

Apache-2.0

CPU-light semantic VAD, pairs
with FlashHead family

Kept — turntaking/listening
state

NVIDIA
Audio2Face2D (NIM)

—

NVIDIA AI
Enterprise SLA +
AI Foundation
Models
Community
License (not open
source; already
entitled)

Explicitly targets
Ada/Ampere/Turing/Blackwell
— excludes A100/H100

Kept — quality
reference, run in
parallel

LipForcing
(14B / 1.3B)

Jun–Jul
2026

Apache-2.0

14B: ~37–50GB VRAM (fits
L40S 48GB); sub-millisecond
time-to-first-frame

Reference
architecture —
too heavy as
primary base
---

Project

Date

License

Hardware for real-time

Verdict

Hallo-Live

Apr 2026

MIT, clean

2× H200 @ 20.4 FPS, 0.94s
latency

Reference
architecture only
— over budget

AvatarForever

Aug 2026

Repo LICENSE
present, but
depends on
Gemma-3

1× H100 @ 27.2 FPS, 768×512

Ruled out —
Gemma Terms of
Use is not OSIapproved and
requires passing
its userestrictions
through to end
users

daVinciMagiHuman
(15B)

2026

Apache-2.0 at
root, but depends
on Stable Audio

1× H100, offline clips only (no
streaming)

Ruled out as base
— Stability AI
Community
License is free
only under $1M
revenue; SR
modules
(540p/1080p) still
worth adopting
standalone

AVTR-1

2026

Split licensing:
weights
communitylicensed, renderer
+ streamer
noncommercialonly regardless of
revenue, face
detector
(InsightFace)
research-only

L40 @ 84ms/chunk (2.4× realtime)

Ruled out — the
two components
that make it "live"
are the ones not
licensed for
commercial use

LiveAvatar
(AlibabaQuark)

Dec 2025

Apache-2.0

5× H800 80GB (single-GPU
needs 80GB+)

Ruled out — far
over budget

OmniForcing

Mar 2026

LTX-2 Community
License (nonstandard)

8× H200 minimum

Ruled out —
license +
hardware
---

Project

Date

License

Hardware for real-time

Verdict

OmniLiveAvatar

Aug 2026

—

Claims 33× speedup on 1×
H200

Ruled out —
vaporware.
README states
plainly: "Code and
checkpoints are
not released yet."

SplatShot

Jun 2026

No LICENSE file

1× A100, 24GB, 10–15 min per
photo, static output only
(doesn't talk)

Ruled out — fails
"brief processing"
by two orders of
magnitude, and
isn't audio-driven

EmoTaG

2026
(CVPR'26)

Research-use
only

Few-shot, 5-second
personalization clip

Ruled out —
license

WanStreamer
(Alibaba)

Jun–Jul
2026

Apache-2.0
license file
present, no
checkpoint
released; API-only
beta since Aug
2026

~550ms full-duplex latency
(single unified model, no fixed
rig)

Not usable today
— the clearest
north star for
architecture,
unusable for code

Vidu S2Avatar

Sep 15,
2026

Credit-metered
API only

720p, 25–42 FPS

Not open —
reference for what
the commercial
ceiling looks like

4. The direction, and why
Recommended stack:
SoulX-FlashHead-1.3B as the render foundation — chosen over every larger, flashier
model specifically because its dependency tree is clean all the way down, not just at
the repo root. ~20 dependencies checked (opencv, diffusers, transformers, accelerate,
gradio, xformers, mediapipe, librosa) — all Apache-2.0/BSD/MIT, nothing gated, nothing
research-restricted. It comfortably clears the cost ceiling with room to spare: 96 FPS
against a 25 FPS real-time requirement on a single RTX 4090, which is exactly the kind
of headroom "alive upon load" needs — spare compute burning on idle presence
instead of a cold start.
---

LeapTalk as the drop-in render/UI layer on the same base — its own ~160-package
dependency tree audited the same way, equally clean. It matters beyond raw speed: its
shipped web demo already implements almost exactly the interface being designed —
upload a portrait, brief processing, streaming talking video on the left, chat/input on
the right. Someone already did the "learn from it, build on it" step this research was
asked to find, and published it Apache-2.0.
SoulX-Duplug (0.6B, Apache-2.0) for the listening/turn-taking layer — it classifies
audio into idle/nonidle/speak/blank states in real time, which is the missing half of
"conversational awareness" that almost nothing else in the entire search actually
modeled (the one model that did, AVTR-1, turned out to be the one with the licensing
problem).
NVIDIA Audio2Face-2D, run in parallel as the quality ceiling the open pipeline is
measured against — not open source, but already covered by the user's existing
NGC/Enterprise entitlement, and engineered for exactly the consumer/prosumer
cards (Ada/Ampere/Turing) this budget targets rather than the datacenter cards it
explicitly excludes.
Why this over the alternatives: every heavier or more "complete"-looking option in
section 3 failed one of the four constraints — too expensive (LiveAvatar, OmniForcing,
Hallo-Live), not actually released (Omni-LiveAvatar), too slow per-photo and not audiodriven (SplatShot), or clean at the surface but carrying a restrictive dependency
underneath (Avatar-Forever's Gemma-3, daVinci-MagiHuman's Stable Audio, AVTR-1's
InsightFace and noncommercial renderer). The FlashHead/LeapTalk/Duplug stack is the
only one that is simultaneously cheap enough, fast enough, and clean enough at every
layer to build a product on without a license audit surfacing a problem after the fact.
On building on someone else's open-source work with integrity: this is standard, welltrodden practice, not something to obscure. The concrete mechanism agreed on:
1. A NOTICE file at the repo root, one entry per upstream project (FlashHead, LeapTalk,
Duplug, wav2vec2) — name, source URL, license, and what was changed. This is what
Apache-2.0 Section 4 actually requires, not just a suggestion.
2. A CI dependency license scan ( pip-licenses against requirements.txt ) on every
merge, gating anything that isn't OSI-approved permissive — this is precisely the
check that would have caught the Gemma-3 dependency automatically, before a
human had to notice it by hand.
3. Never use an upstream project's name or branding to imply their endorsement —
standard across MIT and Apache-2.0 alike.
---

4. Apache-2.0 already disclaims warranties and caps liability (Sections 7–8) for both the
original author and, by inheritance, anyone building on it — that protection comes with
the license and doesn't need to be constructed, only not stripped out on
redistribution.
This practice is what makes "merge other open source without flags" achievable: a
foundation that is permissive at every layer, not just its own LICENSE file, is what actually
allows other permissively-licensed pieces to be merged in later without one of them
quietly attaching a copyleft or revenue-gated obligation to the whole product.

5. Open questions and next steps
LeapTalk FPS resolved: working number is 96 FPS on 1x RTX 4090, base-verified.
FlashHead-1.3B delivers 96 FPS on one RTX 4090 (README-verified). LeapTalk runs 1
NFE on the same base, setting its floor at 96 FPS. The unverified Lite-setting claim of
~200 FPS is dropped from all pipeline documents until measured on hardware. Working
assumption for the pipeline: 96 FPS / 10.4ms per frame -- 4x headroom above the 25
FPS real-time bar, enough to absorb the daVinci SR post-pass without touching the
budget. Note: the UPON LOAD 3.77s failure is cold-start / model-initialization latency,
not steady-state FPS -- different instrument, different fix, tracked separately.
VRAM footprint is bounded, not measured. From the code (bf16 weights, no offload
flags in the single-GPU path, three concurrent streams claimed on one 24GB card),
per-stream footprint has to be comfortably under ~7GB — but that's a derived bound,
not a profiled number.
The listening-reactive motion signal still needs to be built. AVTR-1 proved the concept
(a separate audio track driving reactive idle motion, not just speech) but its
implementation isn't licensed for commercial use. The plan is to reimplement the idea
— wiring Duplug's idle/nonidle/speak/blank state output into FlashHead/LeapTalk's
render loop — rather than import restricted code.
Resolution ceiling. Current real-time open models top out around 512×512–768×512.
The realistic path past that is a separate super-resolution pass after generation, not a
bigger base model — daVinci-MagiHuman ships exactly that as standalone Apache-2.0
540p/1080p modules, worth adopting even though its base generator was ruled out.
Where Audio2Face-2D sits in the pipeline — as an offline quality benchmark to
validate the open stack against, or as a selectable node inside the ACE Cortex graph
itself, still an open design call.
---

Immediate next step, already queued as an urgent task: stand up a new repository
seeded with FlashHead + LeapTalk + Duplug, the NOTICE file, and the CI license
scanner — blocked only on the user being back at a laptop.
Offered and not yet taken: running LeapTalk's streaming demo against a real photo on
real hardware to get the actual first-frame latency and FPS numbers this report
currently has to describe as claims rather than measurements.

6. Update — 2026-09-21
Infra status: Kiro Web sandbox fully provisioned — GitHub connected (native OAuth),
and four secrets loaded globally under Agent settings > Sandbox > Secrets: Hugging Face
token, Google Cloud Compute OAuth client, NVIDIA NIM key, NVIDIA Enterprise
credential. No longer blocked on "being back at a laptop" — build proceeds from Kiro Web.
Work Order 1 (issued today): clone SoulX-FlashHead-1.3B, LeapTalk, and SoulX-Duplug
into services/render-pipeline/ , add a NOTICE file, provision/reuse a GCP GPU
instance, run a smoke test (one photo + one audio clip) and report measured FPS, firstframe latency, and VRAM — replacing the report's prior estimates rather than confirming
them by assumption. On success, deploy the working service to a Hugging Face Space,
and add a CI license scan ( pip-licenses against requirements.txt ) gating nonpermissive dependencies. Status: in progress, numbers pending.
Correction: an earlier note in this thread about switching "the model" to Opus 5 referred
to the chat model answering questions in this research thread, not a component of the
eve-ecc stack. No pipeline model choice changed as a result.
---

