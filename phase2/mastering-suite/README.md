# BERYL Mastering Suite — Phase 2 (assets and earlier prototype)

Live avatar pipeline testing UI. This is the full-stack canvas for wiring, testing
and monitoring the conversational avatar pipeline before it is wired into the CRANE IDE.

> **Correction (2026-10-03):** `EVE-ECC-NODE-UI-PROTO.html` (formerly mislabeled `BERYL-MASTERING-SUITE.html`) is the earlier
> "EVE ECC" prototype (stage chips, EVE Live Studio pane). The newer Mastering Suite shown in `screenshots/BERYL-MASTERING-SUITE-UI.png`
> (Node Inspector / Wiring Spec tabs, one-click model swap, Copy spec / .json) is **not in this repo** - only its screenshot is. The
> closest source on GitHub is `tyronne-os/eve-ecc` (`apps/web/src/components/pipeline/AceCortexPane.tsx`). The CRANE IDE now has a
> Mastering Suite panel with the Research -> Nodes tab (see `src/client/src/components/MasteringSuite.tsx`).

## The UI shown in the screenshot
- **8-node ReactFlow pipeline**: Riva ASR → Berylize 7B LLM → Kokoro 82M TTS → Audio2Face-3D → AnimGraph → Omniverse Kit + Browser WebRTC + Media Clock + Mirror Loop
- **BERYL Live Studio panel** (right): live video feed, blendshape readout (ARKit 52), Talk / Speak / Cycle node controls
- **Node Inspector + Wiring Spec** (bottom): one-click model swap, endpoint/port/latency config
- **Stage rail**: L0 Idle Presence → L1 Audio2Face → L2 Omniverse
- **All-hot indicator**: 8/8 nodes warm

## Pipeline stages
| Stage | What it enables |
|---|---|
| L0 | Control plane only — presence, idle loop |
| L1 | Audio2Face live — full lip-sync + blendshapes |
| L2 | Omniverse RTX — photorealistic render |

## Phase 2 TODO (from HANDOFF.md)
- Wire conversational live avatar into CRANE chat
- Connect AvatarKB second-brain RAG node (see `knowledge/avatar-research/`)
- Podman install wizard
- ZeroGPU Space deploy flow
- MiniMax H3 tunnel wizard
- Big Proppa grader + calibration view
