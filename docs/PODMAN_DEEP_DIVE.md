# Podman for AI: Running, Fine-Tuning, and Merging Models

## Table of Contents

1. [Why Podman for AI workloads](#why-podman-for-ai-workloads)
2. [Running Inference Models](#running-inference-models)
3. [Running Embedding Models](#running-embedding-models)
4. [Running Multi-modal Models](#running-multi-modal-models)
5. [Fine-Tuning Models with Podman](#fine-tuning-models-with-podman)
6. [Quantization (GGUF, AWQ, GPTQ)](#quantization)
7. [Creating Your Own Models via Merges](#creating-your-own-models-via-merges)
8. [Self-Hosting a Full Stack AI App](#self-hosting-a-full-stack-ai-app)
9. [GPU Passthrough in Podman](#gpu-passthrough-in-podman)
10. [Systemd Auto-start for Persistent Models](#systemd-auto-start-for-persistent-models)
11. [Registry Management and Secrets](#registry-management-and-secrets)
12. [Podman Compose for Multi-service AI Stacks](#podman-compose-for-multi-service-ai-stacks)
13. [Quick Reference](#quick-reference)

---

## Why Podman for AI workloads

Podman is a drop-in replacement for Docker with one critical difference: **it runs without a root daemon**. For AI workloads this matters because:

- **Security:** Model servers, Jupyter notebooks, and API gateways run as your user — a compromised container cannot escalate to root.
- **Systemd integration:** `podman generate systemd` produces a unit file that starts your model server on boot, restarts it on crash, and logs to journald — no cron hacks needed.
- **Pods:** Group a model server + its API proxy + a vector DB into a single pod, just like Kubernetes. Start/stop/restart everything together.
- **Docker compatibility:** Every `docker run` command works as `podman run`. Your existing Dockerfiles, compose files, and images all work unchanged.

---

## Running Inference Models

### Ollama (the easiest local model server)

```bash
podman run -d \
  --name ollama \
  -p 11434:11434 \
  -v ollama_data:/root/.ollama \
  --device nvidia.com/gpu=all \
  ollama/ollama

# Pull a model
podman exec ollama ollama pull llama3.2
podman exec ollama ollama pull qwen2.5-coder:14b

# Run inference
curl http://localhost:11434/api/generate \
  -d '{"model":"qwen2.5-coder:14b","prompt":"Write a FastAPI hello world","stream":false}'
```

### vLLM (high-throughput OpenAI-compat server)

vLLM is the fastest production inference engine for Transformer models. It uses PagedAttention for maximum GPU utilization.

```bash
podman run -d \
  --name vllm \
  -p 8010:8000 \
  -v ~/.cache/huggingface:/root/.cache/huggingface \
  -e HF_TOKEN=$HF_TOKEN \
  --device nvidia.com/gpu=all \
  --ipc=host \
  vllm/vllm-openai:latest \
  --model Qwen/Qwen2.5-Coder-14B-Instruct \
  --tensor-parallel-size 1 \
  --max-model-len 32768

# Now it speaks OpenAI API at port 8010 — CRANE connects to it automatically
```

### llama.cpp (CPU+GPU, quantized models)

```bash
podman run -d \
  --name llamacpp \
  -p 8080:8080 \
  -v ~/models:/models \
  --device nvidia.com/gpu=all \
  ghcr.io/ggerganov/llama.cpp:server-cuda \
  -m /models/qwen2.5-coder-14b-instruct-q4_k_m.gguf \
  --host 0.0.0.0 --port 8080 \
  -n 4096 --n-gpu-layers 35

# OpenAI-compat endpoint at /v1/chat/completions
```

### text-generation-inference (TGI by Hugging Face)

```bash
podman run -d \
  --name tgi \
  -p 8010:80 \
  -v ~/.cache/huggingface:/data \
  -e HF_TOKEN=$HF_TOKEN \
  --device nvidia.com/gpu=all \
  ghcr.io/huggingface/text-generation-inference:latest \
  --model-id Qwen/Qwen2.5-Coder-14B-Instruct \
  --max-input-length 4096 \
  --max-total-tokens 8192
```

---

## Running Embedding Models

Embeddings are used for RAG (Retrieval-Augmented Generation), semantic search, and vector databases.

```bash
# TEI — Text Embeddings Inference (HuggingFace, fastest for embeddings)
podman run -d \
  --name tei \
  -p 8020:80 \
  -v ~/.cache/huggingface:/data \
  -e HF_TOKEN=$HF_TOKEN \
  --device nvidia.com/gpu=all \
  ghcr.io/huggingface/text-embeddings-inference:latest \
  --model-id BAAI/bge-large-en-v1.5

# GET embeddings
curl http://localhost:8020/embed \
  -d '{"inputs":"Your text to embed here"}'
```

---

## Running Multi-modal Models

### LLaVA (vision + language)

```bash
podman run -d \
  --name llava \
  -p 8030:8080 \
  -v ~/models:/models \
  --device nvidia.com/gpu=all \
  ghcr.io/ggerganov/llama.cpp:server-cuda \
  -m /models/llava-v1.6-mistral-7b.Q4_K_M.gguf \
  --mmproj /models/llava-v1.6-mistral-7b-mmproj-model-f16.gguf \
  --host 0.0.0.0 --port 8080

# Send an image + question
curl http://localhost:8030/completion \
  -d '{"prompt":"Describe this image","image_data":[{"data":"<base64>","id":1}]}'
```

### Whisper (speech-to-text)

```bash
podman run -d \
  --name whisper \
  -p 8040:9000 \
  onerahmet/openai-whisper-asr-webservice:latest \
  --model base.en
```

---

## Fine-Tuning Models with Podman

### LoRA fine-tuning with Axolotl

Axolotl is the most flexible fine-tuning framework for Transformer models. It supports LoRA, QLoRA, full fine-tune, and DPO.

```bash
# Create a config (save as config.yml in your project)
cat > config.yml << 'EOF'
base_model: Qwen/Qwen2.5-Coder-7B-Instruct
model_type: AutoModelForCausalLM
tokenizer_type: AutoTokenizer

load_in_4bit: true
strict: false

datasets:
  - path: your-dataset.jsonl
    type: sharegpt

dataset_prepared_path:
val_set_size: 0.02
output_dir: ./lora-out

sequence_len: 4096
sample_packing: true

lora_r: 32
lora_alpha: 16
lora_dropout: 0.05
lora_target_modules:
  - q_proj
  - v_proj

gradient_accumulation_steps: 4
micro_batch_size: 2
num_epochs: 3
optimizer: adamw_bnb_8bit
lr_scheduler: cosine
learning_rate: 0.0002

train_on_inputs: false
group_by_length: false
bf16: auto
fp16:
tf32: false
EOF

# Run fine-tuning
podman run --rm \
  -v $(pwd):/workspace \
  -v ~/.cache/huggingface:/root/.cache/huggingface \
  -e HF_TOKEN=$HF_TOKEN \
  --device nvidia.com/gpu=all \
  --ipc=host \
  winglian/axolotl:main-latest \
  python -m axolotl.cli.train /workspace/config.yml
```

The adapter weights land in `./lora-out/`. Load them with any PEFT-compatible loader.

### Unsloth (2x faster LoRA)

```bash
podman run --rm \
  -v $(pwd):/workspace \
  -v ~/.cache/huggingface:/root/.cache/huggingface \
  -e HF_TOKEN=$HF_TOKEN \
  --device nvidia.com/gpu=all \
  --ipc=host \
  unslothai/unsloth:latest \
  python /workspace/train.py
```

### Dataset prep with Distilabel

```bash
podman run --rm \
  -v $(pwd):/workspace \
  -e OPENAI_API_KEY=$OPENAI_API_KEY \
  argilla/distilabel:latest \
  python /workspace/generate_dataset.py
```

---

## Quantization

Quantization reduces model size (e.g. 14B → ~8GB) with minimal quality loss.

### GGUF quantization with llama.cpp

```bash
# Build llama.cpp quantizer
podman run --rm \
  -v ~/models:/models \
  ghcr.io/ggerganov/llama.cpp:full \
  python /llama.cpp/convert_hf_to_gguf.py \
  /models/Qwen2.5-Coder-14B-Instruct \
  --outtype f16 \
  --outfile /models/qwen2.5-coder-14b.f16.gguf

# Quantize to Q4_K_M (best quality/size ratio)
podman run --rm \
  -v ~/models:/models \
  ghcr.io/ggerganov/llama.cpp:full \
  /llama.cpp/build/bin/llama-quantize \
  /models/qwen2.5-coder-14b.f16.gguf \
  /models/qwen2.5-coder-14b.Q4_K_M.gguf \
  Q4_K_M
```

### AWQ quantization

```bash
podman run --rm \
  -v ~/models:/models \
  -v ~/.cache/huggingface:/root/.cache/huggingface \
  -e HF_TOKEN=$HF_TOKEN \
  --device nvidia.com/gpu=all \
  casper-hansen/autoawq:latest \
  python -c "
from awq import AutoAWQForCausalLM
from transformers import AutoTokenizer
model = AutoAWQForCausalLM.from_pretrained('Qwen/Qwen2.5-Coder-14B-Instruct')
tokenizer = AutoTokenizer.from_pretrained('Qwen/Qwen2.5-Coder-14B-Instruct')
model.quantize(tokenizer, quant_config={'zero_point':True,'q_group_size':128,'w_bit':4,'version':'GEMM'})
model.save_quantized('/models/qwen2.5-coder-14b-awq')
"
```

---

## Creating Your Own Models via Merges

Model merging combines the weights of two or more models to create a new model with the strengths of all of them — **no training required**.

### MergeKit (the standard merge tool)

```bash
# Write a merge config (save as merge.yml)
cat > merge.yml << 'EOF'
merge_method: slerp           # spherical linear interpolation
base_model: Qwen/Qwen2.5-Coder-7B-Instruct
models:
  - model: Qwen/Qwen2.5-7B-Instruct      # general reasoning
    parameters:
      t: [0, 0.5, 0.3, 0.7, 1]
  - model: Qwen/Qwen2.5-Coder-7B-Instruct  # coding specialization
    parameters:
      t: [1, 0.5, 0.7, 0.3, 0]
dtype: bfloat16
EOF

# Run the merge
podman run --rm \
  -v $(pwd):/workspace \
  -v ~/.cache/huggingface:/root/.cache/huggingface \
  -e HF_TOKEN=$HF_TOKEN \
  arcee-ai/mergekit:latest \
  mergekit-yaml /workspace/merge.yml /workspace/merged-model \
  --cuda --copy-tokenizer --allow-crimes --out-shard-size 1B --lazy-unpickle
```

### Merge methods explained

| Method | What it does | Best for |
|---|---|---|
| **SLERP** | Smooth interpolation between two models (spherical) | Blending two models with different specializations |
| **TIES** | Task vector merge — keeps parameters where both models agree | Merging 3+ models, reduces interference |
| **DARE** | Drops redundant parameters before merging | Large merges, reduces model bloat |
| **Task arithmetic** | Add/subtract model capabilities (model A + model B - base) | Adding a skill without losing base |
| **Passthrough** | Stack layers from different models vertically | Creating a "Frankenstein" larger model |

### Example: Create a code+reasoning hybrid

```yaml
# merge_code_reason.yml
merge_method: ties
base_model: mistralai/Mistral-7B-v0.1
models:
  - model: codellama/CodeLlama-7b-hf     # code skill
    parameters:
      density: 0.5
      weight: 1.0
  - model: WizardLM/WizardMath-7B-V1.1  # math/reasoning skill
    parameters:
      density: 0.5
      weight: 1.0
dtype: bfloat16
```

### Uploading your merged model to Hugging Face

```bash
podman run --rm \
  -v ~/workspace/merged-model:/model \
  -e HF_TOKEN=$HF_TOKEN \
  huggingface/transformers \
  python -c "
from huggingface_hub import HfApi
api = HfApi()
api.create_repo('your-username/my-merged-model', private=True)
api.upload_folder(folder_path='/model', repo_id='your-username/my-merged-model')
"
```

---

## Self-Hosting a Full Stack AI App

### Podman Compose for a complete AI stack

```yaml
# compose.yml — runs in CRANE with: podman compose up -d
version: "3.9"
services:
  llm:
    image: vllm/vllm-openai:latest
    ports: ["8010:8000"]
    volumes:
      - hf_cache:/root/.cache/huggingface
    environment:
      - HF_TOKEN=${HF_TOKEN}
    command: --model Qwen/Qwen2.5-Coder-14B-Instruct --max-model-len 16384
    devices:
      - nvidia.com/gpu=all

  embeddings:
    image: ghcr.io/huggingface/text-embeddings-inference:latest
    ports: ["8020:80"]
    volumes: [hf_cache:/data]
    environment: [HF_TOKEN=${HF_TOKEN}]
    command: --model-id BAAI/bge-large-en-v1.5
    devices: ["nvidia.com/gpu=all"]

  qdrant:
    image: qdrant/qdrant:latest
    ports: ["6333:6333"]
    volumes: [qdrant_data:/qdrant/storage]

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: crane_db
    volumes: [postgres_data:/var/lib/postgresql/data]
    ports: ["5432:5432"]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

volumes:
  hf_cache:
  qdrant_data:
  postgres_data:
```

Start with: `podman compose up -d`

All five services (LLM server, embeddings, vector DB, SQL DB, cache) launch together. Stop with: `podman compose down`

---

## GPU Passthrough in Podman

```bash
# Verify GPU visibility
podman run --rm --device nvidia.com/gpu=all nvidia/cuda:12.4.0-base-ubuntu22.04 nvidia-smi

# Use a specific GPU (multi-GPU setup)
podman run --rm --device nvidia.com/gpu=GPU-uuid-here nvidia/cuda:12.4.0-base-ubuntu22.04 nvidia-smi

# CDI (Container Device Interface) — recommended for newer Podman/NVIDIA
nvidia-ctk cdi generate --output=/etc/cdi/nvidia.yaml
podman run --rm --device nvidia.com/gpu=all ubuntu nvidia-smi
```

---

## Systemd Auto-start for Persistent Models

Generate a systemd unit from a running container:

```bash
# Start your model server first
podman run -d --name vllm-server [... your run flags ...]

# Generate systemd unit
podman generate systemd --name --new vllm-server > ~/.config/systemd/user/container-vllm-server.service

# Enable and start
systemctl --user daemon-reload
systemctl --user enable --now container-vllm-server.service

# View logs
journalctl --user -u container-vllm-server.service -f
```

Or use CRANE's **PODMAN → CONTAINERS → ⚙ Systemd** button on any running container — it generates the unit file and you can copy it directly.

---

## Registry Management and Secrets

```bash
# Log into a registry (credentials saved in ~/.config/containers/auth.json)
podman login ghcr.io
podman login registry.nvidia.com

# Use a secret for environment variables (more secure than -e flags)
podman secret create hf_token ~/.crane_vault.env
podman run --rm --secret hf_token,type=env,target=HF_TOKEN \
  ghcr.io/huggingface/text-generation-inference:latest

# Use CRANE's Vault — tokens in ~/.crane_vault.env are auto-loaded into
# the FastAPI server environment at startup via vault.load_into_env()
```

---

## Quick Reference

```bash
# Check what's running
podman ps

# See all containers (including stopped)
podman ps -a

# Real-time resource usage
podman stats

# Container logs (follow)
podman logs -f <container-name>

# Shell into a running container
podman exec -it <container-name> bash

# Stop everything
podman stop $(podman ps -q)

# Remove all stopped containers
podman container prune

# Remove unused images
podman image prune

# Full cleanup
podman system prune -a --volumes
```

### Model size vs GPU memory guide

| Model | Precision | GPU VRAM needed |
|---|---|---|
| 7B | FP16 | 14 GB |
| 7B | Q4_K_M (GGUF) | ~4.5 GB |
| 14B | FP16 | 28 GB |
| 14B | Q4_K_M | ~9 GB |
| 14B | AWQ 4-bit | ~8 GB |
| 70B | Q4_K_M | ~42 GB |
| 70B | AWQ 4-bit | ~38 GB |

**berylize-node** (L4 GPU) has **24 GB VRAM** — runs 14B at FP16 or 70B at Q4 with model offloading.
