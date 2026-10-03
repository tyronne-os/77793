---
type: concept
tags: [concept, quality, realism]
---
# Uncanny Valley
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

Home: [[Home]]
