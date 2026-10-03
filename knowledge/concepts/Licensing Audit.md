---
type: concept
tags: [concept, business, risk]
---
# Licensing Audit
A model with Apache-2.0 at the root can still depend on a restrictive component. The team audited the whole dependency tree (research Part 1): Gemma Terms of Use require passing use restrictions to end users; Stability AI Community License is free only under $1M revenue; some stacks split licenses (weights community-licensed, renderer non-commercial, InsightFace research-only); some repos have no LICENSE file. Process: read LICENSE files, check weights license separately from code, check every pretrained dependency (face detectors, VAEs, text encoders), record it in the repo note. Apache-2.0/MIT/BSD with clean trees were the 'keep' list: [[SoulX-FlashHead]], [[Ditto]], [[Pipecat]]. Flag unknowns such as [[MuseTalk]]. Matters for [[Playbook - Affordable and Profitable Deployment]].

## Papers on this
- [[Omni-LiveAvatar - 2608.13602]]

Home: [[Home]]
