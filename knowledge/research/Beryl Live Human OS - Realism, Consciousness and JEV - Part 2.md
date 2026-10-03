---
type: research
source: user-compiled PDF (Sep 21 2026)
tags: [research, avatar, user-authored]
---
# Beryl Live Human OS - Realism, Consciousness and JEV (Part 2)

Related: [[Verification Layer]] · [[Uncanny Valley]] · [[Beryl OS Pipeline v0.2]] · [[Live Avatar Pipeline]]

> Text extracted from the original PDF in `_attachments/`; tables are flattened.

Untitled

Beryl Live Human OS — Realism,
Consciousness & the JEV Integration
Sep 21, 2026

1. One thesis, not two problems
Every failure this project has logged so far splits cleanly into two categories —
appearance and consciousness — but they turned out to be the same failure wearing two
faces.
On appearance: a CSS "life layer" scored 96/100 on the project's own Realness Index, and
the director looked at it and said "it is not alive — this is a blinking portrait." He was right.
The layer was transform math on a flat photograph, and no amount of tuning gets
transform math to close an eyelid.
On consciousness: the AWARENESS 3/4 pillar — situational self-knowledge, i.e. does she
know what she actually is right now — scored 0. The system was in stage L1. She said "I'm
at L0 right now." Not a rendering bug. A proprioception failure: her stated self-model
disagreed with her actual telemetry, and nothing caught it.
The connecting thread, named plainly in the orchestration pivot: in both cases, the
certification that was supposed to catch the failure didn't. The MOTION pillar read
transform values instead of asking what was actually painted, and passed dead output
twice — once while every depth layer animated perfectly behind an opaque portrait. A
high score on the wrong metric is worse than no score at all, and that is exactly what
happened on both appearance and consciousness: the evaluator was checking a proxy
signal, not the ground truth it was supposed to stand in for.
That is the real problem this paper is about. Not "her face doesn't look real enough" and
"her self-model is wrong" as two separate bugs to fix — but the absence of an evaluator
that can be trusted, on either axis, running continuously enough and cheaply enough to
actually catch the failure the moment it happens instead of a periodic certification script
that can be fooled twice by the same kind of mistake. That absence is what JEV closes.
---

2. What JEV actually is
JEV is TypeSafe AI's first public release in a new model class they call System One models
— named directly after Daniel Kahneman's Thinking, Fast and Slow. Existing LLMs, with
chain-of-thought and sequential token generation, are System 2: slow, deliberate,
expensive per call. A System One model is built for the other half of cognition — classify,
route, score, extract, branch — and do it in one shot, not a conversation.
Architecturally, JEV is non-autoregressive: a parallel sampler produces the entire
structured output in a single pass rather than generating text token by token. It does not
write prose and then get parsed — it returns a typed decision plus a calibrated
confidence score directly, constrained to a schema you define. Because the output space
is constrained by construction, TypeSafe reports a 0% structured-output error rate and
0% tool-call error rate — not "rarely fails validation," but structurally cannot emit an
invalid value.
Training uses a method TypeSafe calls Reinforcement Learning for Calibrated Decisions
(RLCD), which optimizes for epistemically honest probabilities rather than human
preference: higher stated confidence is trained to actually mean higher accuracy. This
matters more than it sounds — it's the difference between a model that sounds sure and
a model whose sureness is calibrated to be trustworthy.
The numbers, reported honestly, cost included:
---

JEV

Comparable LLM judge

Latency

70–500ms (avg ~0.4s)

10–38s

Cost

$0.042 / million input
tokens, output free

e.g. $2.00/M for GPT-5.6 Terra

Structured output error rate

0% (by construction)

nonzero

Judge-score variance
(LangSmith agent-eval test)

—

Jev's variance measured 92–
913× lower than GPT-5.6
Luna/Terra and Claude Sonnet
4.6 — i.e. far more repeatable

Cost on a real 5-example eval
set (LangSmith)

$0.34 total

$28.17 (Claude Sonnet 4.6)

Accuracy, TypeSafe's own 4workflow benchmark

67.8%

GPT-5.6 Terra: 67.9% —
essentially tied

The honest tradeoff, stated plainly: JEV is not more accurate than a frontier LLM judge.
On TypeSafe's own benchmark it's a statistical tie with GPT-5.6 Terra. What it trades peak
accuracy for is roughly 193× the speed and 445× the cost efficiency, with far higher
repeatability. That is precisely the profile of a guardrail, not a judge of last resort —
something built to run on every single call, not something built to be right about hard
cases. TypeSafe's own framing agrees: System One models are aimed at decisions inside
software — verification, routing, scoring — not at chat, and not at replacing deep
reasoning.
Status, as of today: early access, behind a waitlist, as of mid-September 2026. Reached
via POST https://api.typesafe.ai/v1/systemone , model route jev-latest , official
Python and JS SDKs. The architecture is unpublished and weights are not released — this
is a proprietary API dependency, not an open-source component. That distinction matters
for section 7.

3. Why this is the missing piece, not just a nice-to-have
The existing architecture already has a two-speed design that nobody had a model for. L0
(idle presence) has a hard budget: control plane answers in under 1 second, always. L1
and L2 are allowed to be slower — A2F, Omniverse cinematic takeover, deliberative
escalation. The original plan for the orchestration layer was Microsoft Agent Framework's
---

Magentic pattern: an LLM-based supervisor manager deciding, on every turn, who acts
next and why. That is a System 2 decision-maker, and it was being asked to also make
System 1-shaped decisions — is this frame valid, is this node lying about its state — at
LLM latency and LLM cost, inside a budget that does not have room for either.
JEV fits the L0 budget the Magentic supervisor structurally cannot. At 70–500ms and a
fraction of a cent per call, a JEV classifier can run on every frame or every utterance, not a
sampled certification pass. This is the direct fix for two named, specific failures:
The MOTION pillar, fixed at the root cause. The certification failed twice because it
read transform values as a proxy for what was painted. A JEV classifier wired to the
actual rendered frame — not the CSS transform driving it — with a schema like
{is_motion_visible: bool, confidence: float, occluding_layer: string |
null} cannot be fooled by a value that looks right on paper, because it never sees the

value — it sees the pixels, every frame, for a third of a cent per thousand frames.
AWARENESS 3/4 (proprioception), fixed structurally instead of caught after the
fact. The failure was a mismatch between her stated stage ("I'm at L0") and her actual
telemetry (L1). A JEV call with schema {stated_stage: string, telemetry_stage:
string, consistent: bool, confidence: float} , run on every utterance against
/v1/nodes/{id} output, catches this the instant it happens — not on the next

scheduled certification run.
The two-speed mapping is precise, not a rebrand of existing plans:
Layer

Budget

What runs there

Why

L0 — always-on
verification

<1s, every
frame/utterance

JEV — typed,
calibrated, cheap
enough to never
sample

Matches System 1:
fast, constrained, highvolume

L1/L2 — diagnosis
and dialogue
policy

Seconds, on
escalation

Magentic / Handoff /
Group Chat
(unchanged from the
pivot doc)

Matches System 2:
deliberative, needs
real reasoning, run
rarely enough that its
cost is fine

JEV doesn't replace the orchestration plan from the pivot doc — it fills the layer
underneath it that the plan never had an answer for: the always-on, structurally honest
verifier that decides when something is wrong cheaply enough to check constantly, so
---

the Group Chat diagnosis quorum only has to convene when there's a real problem to
reason about, not to catch things a script should have caught.

4. Endless possibilities — each one a mechanism, not a slogan
"Endless possibilities" is the brief, but every item below is grounded in a specific schema,
a specific node, or a specific number from section 2 — not aspiration.
Live certification instead of periodic certification. scripts/ecc5-certify.mjs
currently runs on demand and produces a snapshot — which is exactly how a placeholder
got scored 96/100 and how MOTION passed dead output twice. At $0.042/M input tokens
and sub-500ms latency, running the same class of check on every frame or turn instead of
on a sampled run stops being a cost question. The ECC-5 certificate becomes a live
number instead of a report card.
A cross-check on SoulX-Duplug's listening state. Duplug already classifies audio into
idle/nonidle/speak/blank in real time — that's the raw signal. A JEV call with schema
{duplug_state: string, audio_energy_pattern: string, agrees: bool,
confidence: float} gives that raw classification a second, independently-trained,

calibrated opinion — cheap enough to run on every turn, which turns "conversational
awareness" from a single classifier's output into a verified one.
An always-on fault-injection auditor. The pivot doc's standing rule is that fault injection
must hit the real path — shifting audio against Pipe 3's text-derived visemes should
produce a null result, not a fake desync. A JEV classifier watching for exactly that nullresult signature turns "we tested this once and wrote it down" into a check that runs
every time the pipeline is touched, catching the day someone accidentally rewires Pipe 3
to derive visemes from audio instead of text.
Typed routing inside the Handoff graph. LangChain's own production pattern — a "Jev
Classifier" making routing and tool-call decisions inside an agent's control loop — maps
directly onto the Handoff pattern's node-to-node edges (ASR → Agent → TTS → A2F). Not
every handoff needs an LLM to decide where a signal goes next; many are classification
problems JEV is built for, freeing the Magentic supervisor to spend its (expensive, slow)
reasoning only on handoffs that are actually ambiguous.
A liveness guardrail on the render pipeline itself. Whichever render stack ships —
FlashHead, LeapTalk, or the pipeline still being chosen — a JEV classifier can watch its
output stream directly: {frame_has_motion: bool, occlusion_detected: bool,
---

blink_in_range: bool} , run continuously, as the thing that would have caught the

opaque-portrait failure in real time rather than in a certification run written after the fact.
Evaluation as a shipped product feature, not a research cost. TypeSafe's own LangSmith
comparison ran five test examples for $0.34 against $28.17 for an LLM judge — a ~83× gap
on a toy set that only widens at product scale. That is the difference between "we ran a
certification before the demo" and "every user's session is verified live," and it's a genuine
product capability, not just cheaper QA.

5. What makes this ours
The prior survey of the field — LiveAvatar, Hallo-Live, SoulX-FlashHead, LeapTalk, AvatarForever, and everything else checked against source — published generation-quality
metrics: FPS, FID, sync-C, latency to first frame. Not one of them publishes a runtime
self-verification layer. They report how good the model was in evaluation; none of them
ship a mechanism for verifying, live, in production, on a specific user's session, that what's
being rendered right now is actually what it claims to be.
That gap is exactly where Beryl Live Human OS can differentiate, and it isn't a marketing
claim — it's the literal shape of the two failures already logged. Nobody else in the
surveyed field has had a certification score a placeholder 96/100 in public and had to
explain why, because nobody else in the surveyed field runs a certification against their
own output at all. Owning that — a photoreal, license-clean, cost-bounded render stack
plus a live, calibrated, structurally-honest verification layer wired into every frame — is a
combination nothing in the survey has, not because it's exotic, but because nobody
building the render side has needed an answer to "how do you know she's actually alive
right now" the way this project was forced to by its own two public failures.
The brand case, stated plainly: everyone else is shipping a face. Beryl Live Human OS
would be the one shipping a face with a receipt — a verifiable, per-session, cheapenough-to-run-always answer to the exact question the director asked in August: is this
actually alive, or does it just look alive on a chart.

6. On "consciousness" — precisely, not loosely
This paper uses "consciousness" the way the project's own certification does: as a name
for situational self-knowledge — does the system's stated model of itself match what's
actually true of it — not as a claim that anything here is sentient or has subjective
experience. AWARENESS 3/4 failing because the system said "I'm at L0" while telemetry
---

showed L1 is a proprioception failure, in the same sense a person misjudging where their
own arm is has a proprioception failure. It is a real, measurable, fixable property. It is not a
claim about inner experience, and nothing in this paper should be read as making one.
What makes JEV unusually well-suited to this specific, narrow, honest definition is its
training objective: RLCD optimizes for epistemically honest probabilities — a model whose
stated confidence is trained to actually track its accuracy. That is close kin to what
proprioception verification needs: not a model that sounds certain, but a model whose
certainty means something. Using JEV to check "does her self-report match her
telemetry" is not a claim that JEV understands consciousness — it's a calibrated classifier
checking a well-specified, falsifiable, boring fact: do these two numbers agree. That
boring fact is exactly what was missing when AWARENESS 3/4 scored 0, and closing that
gap is the actual, buildable claim here — appearance of coherent self-knowledge, verified
continuously, not consciousness itself.

7. Honest caveats
The API key could not be verified in this environment. This session's environment
variables were checked directly and contain nothing matching TypeSafe or JEV. A
deeper filesystem search for credential files was blocked by this session's own
security guardrail (a "credential exploration" classifier) and was not worked around —
that block is a legitimate safety boundary, not a bug to route past. If the key was
exported on your laptop rather than this cloud session, or in a shell profile this
container doesn't source, it will not be visible here. This should be confirmed directly
against api.typesafe.ai before any integration work assumes it's live.
JEV is proprietary, not open source. Architecture unpublished, weights not released,
API-only, currently in early access behind a waitlist. This sits outside the licenseintegrity framework established in the earlier report (the Apache-2.0, dependencyaudited FlashHead/LeapTalk/Duplug stack) in a specific, tractable way: called as an
HTTP API rather than vendored as code, it doesn't attach license obligations to the
codebase the way the Gemma or Stable Audio dependencies would have — but it is a
new vendor dependency, with its own availability and pricing risk, and belongs in the
same dependency inventory as everything else, tracked as a service dependency
rather than a code dependency.
JEV is not more accurate than a strong LLM judge — 67.8% versus GPT-5.6 Terra's
67.9% on TypeSafe's own benchmark, a statistical tie. Its case rests entirely on being
~193× faster, ~445× cheaper, and far more repeatable (92–913× lower variance), which
is the right tradeoff for a guardrail that must run on every call, and the wrong tool for a
---

hard diagnostic judgment call that runs rarely. Every use case in section 4 was chosen
because it's a narrow, well-specified, high-frequency check — not because JEV should
replace the Magentic/Group-Chat diagnosis layer, which still needs real deliberative
reasoning.
Early access means availability risk. A waitlisted, mid-September-2026 product is not
yet a dependency to build a critical path on without a fallback — the L0 verification
layer described in section 3 should degrade gracefully to the existing certification
script if the API is unavailable, not hard-fail the control plane.
This paper is a design direction, not a shipped integration. Nothing here has been
tested end-to-end against the actual ace-controller telemetry or a real render
pipeline. The next concrete step is a small proof of concept: one JEV call, one schema,
wired to one real signal — most usefully the AWARENESS 3/4 proprioception check,
since it's the one pillar with a documented, reproducible failure to test against.

8. Plan A, locked 2026-09-21
This is now Plan A, authoritative until a specific, evaluated alternative demonstrably
beats it — not superseded by a new model being mentioned, only by one that's been
checked against source the way everything here was.
Render: LeapTalk (Apache-2.0), forked on SoulX-FlashHead-1.3B, on 1× RTX 4090.
Turn-taking: SoulX-Duplug 0.6B (Apache-2.0), listening state feeding the brain.
Foundation: Nemotron Agent (existing) + a new Advanced Memory layer, crosssession episodic/vector recall.
Verification layer: as of today, self-hosted Kev is primary, not JEV — the reasoning is
in section 9. JEV remains an available hosted upgrade path for the specific cases
where its higher calibration ceiling is worth the API cost and the proprietary
dependency.
Everything else from the prior sections — the license audit, the NOTICE-file practice, the
CI dependency scan, the fork provenance table — still applies unchanged. Locking Plan A
doesn't mean stopping the search; it means the bar for replacing any piece of it is now
"checked against source and demonstrably better," not "looked promising in a search
result."
---

9. Kev — the open-source verification layer
Correction on provenance, stated plainly because it matters for section 10: tyronneos/kev-beryl-brain is not original work yet. Checked directly — every commit in the
visible history is authored by Jared Palmer ( jp@cognition.ai , the Formik/TSDX/Razzle
author, now at Cognition), the last one dated today. This is his jaredpalmer/kev project,
copied into this account. That's a completely normal starting point for a fork — the same
practice this whole research thread has been built around — but it needs to be named
correctly, not presented as Beryl's own research, or the "owning the science" brand claim
in section 10 collapses the first time someone checks git log .
What Kev actually is: an open reproduction of Jev's architecture (credited explicitly to a
third-party write-up, "Jev's Architecture Unmasked"), built on Qwen3.5 bases (0.8B / 4B /
9B, plus a previous Qwen3 generation kept for Apple Silicon latency), trained with LoRA +
a pointer head that scores option tokens rather than generating text — the same nonautoregressive, typed-decision shape as Jev. It speaks JEV's own API: POST
/v1/systemone , and TypeSafe's official Python SDK works against it unmodified by

pointing base_url at your own server. The three schemas designed for the pipeline
prototype — proprioception, motion, listening cross-check — run against Kev with no
changes.
Fully open, license-clean, matching the standard already set: Apache-2.0 for the code
and for the Qwen3.5 base models. Training datasets carry their own licenses, disclosed
per-checkpoint in the model cards rather than buried — the same transparency this
project's own NOTICE-file practice was built to enforce, which is a good sign about the
project's own discipline.
Self-hosted, so the API cost objection is not just reduced, it's zero. uv run python -m
kev.serve --run jaredpalmer/kev-4b --port 8009 runs on CUDA, ROCm, or Apple

Silicon. On CUDA with flash-linear-attention installed, a five-question request takes
tens of milliseconds on an H100 — comparable to or faster than JEV's own 70–500ms, and
the marginal cost per call is your own GPU-second, not $0.042/M tokens paid to a vendor.
The honest gap, reported by the project itself, not hidden:
Kev-9B

Jev

Accuracy, new sources (dev/test)

0.822 / 0.852

0.857 / —

Brier score, new sources (lower is better)

0.286 / 0.237

0.211 / —
---

Kev-9B

Jev

Share of decisions automatable at a 5% error
budget

0.45–0.57

0.70

Confident wrong answers (≥0.9 probability, new
sources)

4.0%

3.7%

Kev-9B trails Jev by roughly 3.5 points on out-of-distribution accuracy, and its calibration
ceiling — the share of decisions you can safely automate without a human check — is
meaningfully behind. The project's own README says it plainly: this isn't a controlled
comparison, since nobody knows what Jev was trained on. That honesty is itself evidence
Kev is a credible thing to build on — a repo that oversold its own numbers would be a
worse foundation regardless of the numbers themselves.
What this does and does not unlock — scoping the premise in the question. Kev
replaces JEV specifically in the verification mesh: the proprioception check, the motion
check, the listening cross-check. It does not touch, and does not give "open-source
freedom to improve," the render nodes — LeapTalk, FlashHead, and Duplug remain
separate Apache-2.0 projects with their own separate codebases and their own separate
fine-tuning paths. One repo does not unlock all major nodes; it unlocks the one node this
whole research thread identified as the actual gap.
The real unlock, and it's a real one: kev.train --init_from jaredpalmer/kev-4b warmstarts a fine-tune from the released checkpoint on your own labeled examples — a few
hundred are enough, per the project's own documented case study (a from-scratch finetune scored 0.33 on a downstream eval; the same data starting --init_from the released
checkpoint scored 0.88). Fine-tuned on Beryl's own MOTION-pillar dead-output cases
and AWARENESS 3/4 proprioception mismatches — the two failures that started this
entire research arc — that becomes a decision model nobody else has, because nobody
else has that training data. That, not the base fork, is the actual path to owning something
here.
One operational flag, unrelated to licensing: the server binds 127.0.0.1 with no
authentication by default. Fine for local development, not fine to expose without adding
auth first.
Verdict: run Kev-9B or Kev-4B self-hosted as the primary verification model — free, fast
on CUDA, license-clean, and fine-tunable on proprietary data. Keep JEV available as a
fallback for anything where the ~3.5-point calibration gap genuinely matters more than
the cost and dependency, once its API key is actually confirmed live.
---

10. Owning the science — a brand identity direction
Every brand claim below is load-bearing on something already built or already found true
in this research — not aspiration dressed as strategy. And the Kev provenance finding
above sets the one hard rule for all of it: the brand can only claim what's actually been
done. Forking is normal; presenting a fork as original research is the one move that would
break this identity the first time anyone checks.
The throughline, and it's real: this project has now had two public failures — a
certification that scored a CSS placeholder 96/100, and a proprioception pillar that scored
0 because the system's self-report disagreed with its own telemetry — and both times,
the response was to name the failure precisely and build a structural fix, not a better
demo. Nobody else in the entire field surveyed across this research publishes anything
like that. They publish FID scores and FPS numbers. Not one of them publishes a runtime
self-verification layer, and not one of them has had to explain, in public, why their own
evaluation gave a wrong answer twice.
Brand pillar 1 — the receipt, not the reel. Every claim about realism ships with the live
certificate that proves it, the same way ECC-5 already works: a number, a method to
reproduce it, and an honest gate ("back to the lab" is a real, sayable outcome, not
something a brand hides). Competitors show a polished clip. This shows the clip and the
proof.
Brand pillar 2 — calibrated, not confident. This is not a slogan invented for marketing —
it's literally what JEV and Kev are trained to do: RLCD optimizes for probabilities that
mean what they say, not for sounding sure. A brand voice that states calibrated
uncertainty ("87% confident, here's why") instead of unqualified certainty is a genuinely
rare register in an industry that oversells by default, and it costs nothing extra to say,
because the system underneath is already built to produce exactly that number.
Brand pillar 3 — fork in the open, own the delta. The NOTICE-file practice, the CI license
scan, and now the --init_from fine-tuning path aren't just legal hygiene — made visible,
they're the R&D culture: publish what was forked and from whom, publish what's
proprietary and why, never blur the two. A public NOTICE.md crediting LeapTalk,
FlashHead, Duplug, and Kev by name — the way this section credits Jared Palmer by name
— is a trust signal competitors building on the same open-source substrate mostly don't
bother making visible.
Visual system — promote what's already operational, don't invent new marketing
colors. The product's own engineering palette already encodes the split this brand is
about: electric blue for the living system (presence, motion, conversation — the
---

render/brain/memory path), gold for the proof layer (research badges, the JEV/Kev
verification annotations, already used exactly this way in both the pivot doc's node graph
and the pipeline prototype). Turning that internal convention into the public brand system
is unusually credible precisely because it wasn't designed as marketing — it's what the
engineers already reach for when they need to mark "this is verified."
Naming, one confirmed and one aspirational — kept separate on purpose. "Beryl Live
Human OS" as the master brand is already in use in this research and fits: it names the
platform, not a single avatar. "ECC-5" as a public-facing trust mark — something other
builders in this space could eventually cite the way video work cites a codec or a color
standard — is a real possibility given the certificate already exists and already fails things
honestly, but it's aspirational: it requires the certification to survive contact with outside
scrutiny first, which hasn't happened yet. State it as a direction being worked toward, not
a claim already earned.

11. The Clay — Datasets, Benchmarks, and the Path to FaceTime
Realism
The FaceTime-friend standard separates into five measurable dimensions — emotion,
micro-expression, gaze, hair physics, and body micro-movement. Each has publicly proven
datasets, benchmarks, and training milestones already accumulated by academic labs.
None of this requires Kev to become a new model class; it requires Kev’s --init_from
fine-tuning pipeline trained on the right signal for each dimension, then wired to the right
driving input in the render layer.
Dimension 1 — Emotion & Expression. Three datasets cover this cleanly: AffectNet
(450K+ images, 8 basic + 11 compound categories, continuous Valence/Arousal labels, MIT
license — the most-cited benchmark in 2025–2026 expression papers); BP4D+
(spontaneous 3D facial expressions, AU intensity-labeled, physiological signals coregistered — gold standard for fine-grained work); MAFW (10,045 video clips, multi-label
compound emotion in live conversation, Apache-compatible). Fine-tune Kev-4B with -init_from on AffectNet + MAFW with schema {emotion_label: string, valence:
float, arousal: float, intensity: float, confidence: float} . Every turn

produces a typed emotion prediction. FlashHead and LeapTalk both support conditional
expression driving — the predicted emotion feeds as a conditioning signal replacing the
neutral default. The render stack doesn’t change; the input it receives does.
---

Dimension 2 — Micro-Expressions. The datasets: CASME II (247 sequences of
spontaneous micro-expressions, AU-coded, onset/offset labeled); SAMM (159 sequences,
26 subjects, FACS-coded, best for temporal precision); MMEW (300 clips, partial-face
recognition). Micro-expressions are the hardest realism dimension because they’re
temporal — 1/25 to 1/5 of a second, barely perceptible consciously but registered as “alive”
at a gut level. Kev’s schema is a trigger: {trigger_microexpression: bool, au_code:
int, onset_delay_ms: int, duration_ms: int, confidence: float} . The model

predicts from dialogue context whether a micro-expression should appear and which
action unit drives it. The render layer fires a timed AU injection. No micro-expression at all
is what makes most current avatars read as hollow — not wrong, but absent.
Dimension 3 — Gaze & Blink. ETH-XGaze (110,856 images, 80 subjects, high-resolution
gaze ground truth) and MPIIFaceGaze (in-the-wild, 45K images) cover estimation.
Audio2Face-2D already exposes blink and gaze natively — this dimension is partially
shipped. Kev adds semantic gaze: {gaze_target: string, should_break_gaze: bool,
blink_trigger: bool, confidence: float} — the difference between eyes that move
procedurally and eyes that break contact when a topic gets uncomfortable, or hold steady
when making a point.
Dimension 4 — Hair & Soft Tissue. This is a render-layer problem, not a Kev problem. Kev’s
role is to predict head-movement magnitude that triggers physics responses
downstream. The relevant work: NeuralHDHair (2022, neural strand-level hair, MIT
license); HairStep (2023, text-driven strand control); PhysX strand solver already
embedded in Omniverse. Kev schema: {head_angular_velocity: float, direction:
string, trigger_hair_simulation: bool, intensity: float} . Hair that follows head
turns with ≤2 frame lag is one of the most immediately perceptible realism signals current
portrait avatars universally lack.
Dimension 5 — Body Micro-Movements. The datasets: MAAD (Micro-Action Dataset,
2024, 7,392 video clips, 77 micro-action classes including shoulder adjustments, neck
tensions, breathing rhythm, finger movements); BEAT (Body-Expression-Audio-Text,
2023, 60 speakers × 34 emotions, synchronized body language + speech, Apache-2.0).
The FaceTime-level realism test is not gross motion — it is listener behavior: the slight
forward lean when something gets interesting, the micro-nod while the other person is
speaking, the shoulder relaxation signaling comfort. Kev schema: {listener_state:
string, nod_trigger: bool, lean_direction: string, shoulder_tension: float,
breathing_visible: bool, confidence: float} . Fine-tuned on BEAT with --init_from
kev-4b , this becomes an always-on body-language predictor at zero marginal cost and

sub-50ms latency.
---

Training Milestones — a proposed sequence.
M1 — Emotion Baseline. Fine-tune Kev-4B on AffectNet + MAFW. Target: Valence/Arousal
prediction accuracy ≥0.85 on held-out conversation clips. Gate: emotion-driven
FlashHead output passes a human A/B test against neutral-expression baseline.
M2 — Micro-Expression Trigger. Fine-tune M1 checkpoint on CASME II + SAMM. Gate:
spontaneous micro-expressions appear on ≥1 in 8 turns without being identified as
artificial in a blind viewer study.
M3 — Hair Physics Coupling. Wire Kev head-velocity schema to Omniverse strand solver.
Gate: hair follows head turns with ≤2 frame lag in Kev-triggered L1/L2 mode.
M4 — Body Language. Fine-tune M2 checkpoint on BEAT dataset. Gate: avatar produces
listener nods and shoulder behavior that a blind rater scores ≥4/5 on a “feels like a real
person listening” scale.
M5 — Emotional Arc Continuity. Fine-tune M4 on IEMOCAP multi-turn sequences. Gate:
Valence/Arousal trajectory stays contextually consistent across ≥5 consecutive turns
without resetting to neutral.
What --init_from actually makes possible. The documented case study is stark: fromscratch fine-tune scored 0.33 accuracy; same data starting --init_from the released 4B
checkpoint scored 0.88. That gap is what makes this milestone sequence tractable —
each stage adds a few hundred labeled examples to a checkpoint that already
understands calibrated decision-making. M2 builds on M1, M4 builds on M2. Each
milestone’s training data is the proprietary moat: CASME II + SAMM + BEAT + the
pipeline’s own proprioception and motion failure cases, assembled nowhere else. The
base model exists, the fine-tuning infrastructure is documented and tested, the datasets
are real and open. The milestones above are the path from a talking portrait to something
that reads as a friend on a call.
---

