# Avatar Knowledge Base — Second Brain

This folder is the RAG knowledge base for the CRANE Second Brain node.
It is **not** Qwen's primary training knowledge — it is injected as context
at inference time via semantic retrieval, wired through the ReactFlow
BackendPanel AvatarKB custom node.

## Documents

| File | Contents |
|---|---|
| `Tokkio Guide Map.md` | Full NVIDIA ACE / Tokkio pipeline map: Riva ASR → ACE Agent → Riva TTS → Audio2Face-2D → Omniverse RTX |
| `Beryl Re-Engineering Map.md` | Node-by-node breakdown of the Beryl Live Human OS over LiveAvatar — Qwen3-TTS, SoulX-Duplug, B.B.P Decider, Elana GPU Session Manager |
| `Beryl OS Pipeline v0.2.md` | Pipeline v0.2: LeapTalk fork, Nemotron brain, Decider verification mesh, POST /v1/systemone |
| `live avatar researchpart 1.pdf` | Primary avatar research — part 1 |
| `live avatar researchpart 2.pdf` | Primary avatar research — part 2 |
| `tokkio-guide-map.pdf` | Tokkio guide map PDF |

## Architecture

```
User input
    │
    ▼
[CRANE Chat] ──query──► [AvatarKB Node (ReactFlow)]
                              │
                         ChromaDB (local)
                         embedded chunks
                              │
                         top-k results
                              │
    ◄──────── context ────────┘
    │
    ▼
[Qwen2.5-Coder via tunnel :8010]
    (primary knowledge unchanged)
    │
    ▼
Response
```

## Second Brain Node — ReactFlow
The `AvatarKB` custom node lives in `BackendPanel.tsx`.  
It shows: doc count · embedding status · last query · chunk hit rate.
