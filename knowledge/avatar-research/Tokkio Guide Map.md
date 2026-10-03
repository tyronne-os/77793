NVIDIA ACE Platform

# Tokkio *Guide Map*

All guides open in a new tab directly from your browser · [docs.nvidia.com/ace/latest/workflows/tokkio](https://docs.nvidia.com/ace/latest/workflows/tokkio/index.html)

◈

**Customer Service Avatar workflow.** Tokkio is NVIDIA's reference implementation of a real-time photorealistic digital human: Riva ASR → ACE Agent LLM → Riva TTS → Audio2Face-2D animation → Omniverse RTX renderer, all containerized via Helm charts on NVIDIA CloudXR/CSP. Each guide below links directly to docs.nvidia.com.

ACE Stack — Tokkio Components

Tokkio Workflow

Orchestration layer tying all ACE microservices together

Riva ASR

GPU-accelerated speech-to-text, streaming, low-latency

ACE Agent

Dialog + RAG pipeline, Nemotron / custom LLM backend

Riva TTS

Neural voice synthesis, radTTS / VITS, multiple voices

Audio2Face-2D

Real-time lip-sync + facial animation from audio stream

Omniverse RTX

Photorealistic rendering, USD scene, skin shader

AnimGraph

Emotion + gesture state machine layered over A2F output

Tokkio UI

Reference React frontend: WebRTC video + mic input

Documentation Guides

🚀

Getting Started

First run, prerequisites, quickstart

- [Overview What Tokkio is and which ACE microservices it bundles ↗](https://docs.nvidia.com/ace/latest/workflows/tokkio/index.html)
- [Getting Started System requirements, NGC credentials, first deployment ↗](https://docs.nvidia.com/ace/latest/workflows/tokkio/getting-started.html)
- [Prerequisites GPU requirements, NGC API key, Helm, Docker setup ↗](https://docs.nvidia.com/ace/latest/workflows/tokkio/prerequisites.html)
- [Quickstart Spin up a working Tokkio instance in one command ↗](https://docs.nvidia.com/ace/latest/workflows/tokkio/quickstart.html)

⬡

Architecture

System design, data flow, microservices

- [Architecture Overview End-to-end pipeline diagram: ASR → LLM → TTS → A2F → render ↗](https://docs.nvidia.com/ace/latest/workflows/tokkio/architecture.html)
- [Microservices Reference Each container, its port, health endpoint, and gRPC API ↗](https://docs.nvidia.com/ace/latest/workflows/tokkio/microservices.html)
- [Latency Budget Per-stage timing targets and profiling guidance ↗](https://docs.nvidia.com/ace/latest/workflows/tokkio/latency.html)

⛭

Deployment

Cloud, on-prem, Kubernetes Helm

- [Deployment Guide Helm chart values, namespace config, GPU node selectors ↗](https://docs.nvidia.com/ace/latest/workflows/tokkio/deployment.html)
- [AWS Deployment EKS cluster, p4d/p3 instance sizing, CloudFront CDN ↗](https://docs.nvidia.com/ace/latest/workflows/tokkio/aws-deployment.html)
- [Azure Deployment AKS with ND A100 v4 node pools, blob storage config ↗](https://docs.nvidia.com/ace/latest/workflows/tokkio/azure-deployment.html)
- [GCP Deployment GKE with A100/L4 node pools — closest to berylize-node ↗](https://docs.nvidia.com/ace/latest/workflows/tokkio/gcp-deployment.html)
- [On-Premises Deployment Bare-metal or local cluster without managed Kubernetes ↗](https://docs.nvidia.com/ace/latest/workflows/tokkio/on-prem-deployment.html)

◑

Audio2Face-2D

Lip-sync, expression, animation

- [A2F Overview 2D portrait animation from audio — single reference image ↗](https://docs.nvidia.com/ace/latest/workflows/tokkio/audio2face.html)
- [Customizing the Avatar Swap portrait image, adjust skin tone, set face region ↗](https://docs.nvidia.com/ace/latest/workflows/tokkio/customizing-avatar.html)
- [AnimGraph Emotion state machine, blink/idle behavior, gesture triggers ↗](https://docs.nvidia.com/ace/latest/workflows/tokkio/animgraph.html)
- [Streaming Video Output WebRTC pipeline from renderer to browser, codec config ↗](https://docs.nvidia.com/ace/latest/workflows/tokkio/streaming-video.html)

⬟

ACE Agent / Dialog

LLM, RAG, intent, persona

- [ACE Agent Overview Chatbot server, plugin system, Triton inference backend ↗](https://docs.nvidia.com/ace/latest/workflows/tokkio/ace-agent.html)
- [Customizing the Bot System prompt, persona, RAG knowledge base, guardrails ↗](https://docs.nvidia.com/ace/latest/workflows/tokkio/customizing-bot.html)
- [Plugin Development Write custom Python plugins for tool-call / function-calling ↗](https://docs.nvidia.com/ace/latest/workflows/tokkio/plugin-development.html)
- [Nemotron Integration Swap in Nemotron-4 340B or custom NIM endpoints ↗](https://docs.nvidia.com/ace/latest/workflows/tokkio/nemotron.html)

◎

Riva Speech

ASR, TTS, language model

- [Riva ASR Config Streaming ASR, acoustic model, language model hotwords ↗](https://docs.nvidia.com/ace/latest/workflows/tokkio/riva-asr.html)
- [Riva TTS Config Voice selection, radTTS/VITS models, SSML, speaking rate ↗](https://docs.nvidia.com/ace/latest/workflows/tokkio/riva-tts.html)
- [Barge-In / Interruption VAD-based interrupt handling, turn-taking configuration ↗](https://docs.nvidia.com/ace/latest/workflows/tokkio/barge-in.html)

▣

UI & Frontend

Tokkio UI, WebRTC, embed

- [Tokkio UI Overview React reference app: WebRTC video panel + mic/text input ↗](https://docs.nvidia.com/ace/latest/workflows/tokkio/ui.html)
- [WebRTC Integration Signaling, ICE, STUN/TURN, latency tuning for sub-100ms ↗](https://docs.nvidia.com/ace/latest/workflows/tokkio/webrtc.html)
- [Embedding in Your App Integrate Tokkio into an existing web or mobile app ↗](https://docs.nvidia.com/ace/latest/workflows/tokkio/embedding.html)
- [Customizing the UI Theming, branding, layout changes to the reference app ↗](https://docs.nvidia.com/ace/latest/workflows/tokkio/customizing-ui.html)

⊕

Operations

Monitoring, scaling, troubleshoot

- [Monitoring & Metrics Prometheus metrics, Grafana dashboards, VRAM alerts ↗](https://docs.nvidia.com/ace/latest/workflows/tokkio/monitoring.html)
- [Scaling Guide Horizontal pod autoscaling, multi-GPU, CDN offload ↗](https://docs.nvidia.com/ace/latest/workflows/tokkio/scaling.html)
- [Troubleshooting Common errors, CUDA OOM recovery, audio sync issues ↗](https://docs.nvidia.com/ace/latest/workflows/tokkio/troubleshooting.html)
- [Release Notes What changed in each Tokkio version, breaking changes ↗](https://docs.nvidia.com/ace/latest/workflows/tokkio/release-notes.html)

⌗

API Reference

REST, gRPC, event schemas

- [API Overview All REST and gRPC endpoints, auth, versioning ↗](https://docs.nvidia.com/ace/latest/workflows/tokkio/api-reference.html)
- [Pipeline Control API Start/stop rendering, inject utterances, barge-in signal ↗](https://docs.nvidia.com/ace/latest/workflows/tokkio/pipeline-api.html)
- [Event API WebSocket event stream: turn start/end, emotion, anim state ↗](https://docs.nvidia.com/ace/latest/workflows/tokkio/event-api.html)

⊡

Blueprints & Examples

Reference implementations, GitHub

- [Digital Human Blueprint GitHub: full Tokkio reference impl, docker-compose + Helm ↗](https://github.com/NVIDIA-AI-Blueprints/digital-human)
- [NVIDIA/ACE GitHub ACE platform source, sample apps, integration scripts ↗](https://github.com/NVIDIA/ACE)
- [Customer Service Example Retail/banking use-case walkthrough with RAG knowledge base ↗](https://docs.nvidia.com/ace/latest/workflows/tokkio/customer-service.html)
- [NIM — Try Live Demo Interactive Tokkio demo on build.nvidia.com (no signup) ↗](https://build.nvidia.com/explore/virtual-assistant)

NVIDIA ACE · Tokkio 5.0 · [Main docs index ↗](https://docs.nvidia.com/ace/latest/workflows/tokkio/index.html) All links open docs.nvidia.com in a new tab