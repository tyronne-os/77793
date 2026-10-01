"""
CRANE ZeroGPU Generation Space
================================
Runs on Hugging Face ZeroGPU (free A100 for up to 5 min/request).
Exposes an OpenAI-compatible REST API that CRANE uses as a fallback
when berylize-node is paused.

Set CRANE_HF_MM_URL in your environment to point at this Space:
  CRANE_HF_MM_URL=https://<your-username>-crane-gen.hf.space

Endpoints:
  POST /v1/images/generations   → FLUX.1-schnell (fast, 1024px)
  POST /v1/video/generations    → CogVideoX-5B (5s clip, A100)
  GET  /health
"""
from __future__ import annotations

import base64
import io
import os
import time
import uuid
from typing import Optional

import spaces
import torch
from diffusers import CogVideoXPipeline, FluxPipeline
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="CRANE ZeroGPU Space")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ── lazy-loaded pipelines (loaded on first GPU request) ──────────────────────

_flux_pipe: FluxPipeline | None = None
_cog_pipe:  CogVideoXPipeline | None = None


def _load_flux() -> FluxPipeline:
    global _flux_pipe
    if _flux_pipe is None:
        _flux_pipe = FluxPipeline.from_pretrained(
            "black-forest-labs/FLUX.1-schnell",
            torch_dtype=torch.bfloat16,
        ).to("cuda")
        _flux_pipe.enable_attention_slicing()
    return _flux_pipe


def _load_cog() -> CogVideoXPipeline:
    global _cog_pipe
    if _cog_pipe is None:
        _cog_pipe = CogVideoXPipeline.from_pretrained(
            "THUDM/CogVideoX-5b",
            torch_dtype=torch.bfloat16,
        ).to("cuda")
        _cog_pipe.enable_attention_slicing()
        _cog_pipe.enable_sequential_cpu_offload()
    return _cog_pipe


# ── request/response models ──────────────────────────────────────────────────

class ImageRequest(BaseModel):
    prompt: str
    n: int = 1
    size: str = "1024x1024"
    response_format: str = "b64_json"
    aspect_ratio: Optional[str] = "1:1"


class VideoRequest(BaseModel):
    prompt: str
    duration: int = 5
    output_path: Optional[str] = None   # ignored server-side; client saves


# ── image endpoint ────────────────────────────────────────────────────────────

@spaces.GPU(duration=60)
def _generate_image_gpu(prompt: str, width: int, height: int) -> bytes:
    pipe = _load_flux()
    result = pipe(
        prompt=prompt, width=width, height=height,
        num_inference_steps=4, guidance_scale=0.0,
    )
    img = result.images[0]
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=92)
    return buf.getvalue()


@app.post("/v1/images/generations")
async def images_generations(req: ImageRequest):
    try:
        w, h = (1024, 1024)
        if req.size:
            parts = req.size.split("x")
            if len(parts) == 2:
                w, h = int(parts[0]), int(parts[1])
        if req.aspect_ratio == "16:9":
            w, h = 1344, 768
        elif req.aspect_ratio == "9:16":
            w, h = 768, 1344
        elif req.aspect_ratio == "4:3":
            w, h = 1024, 768

        img_bytes = _generate_image_gpu(req.prompt, w, h)
        b64 = base64.b64encode(img_bytes).decode()
        return {"created": int(time.time()), "data": [{"b64_json": b64}]}
    except Exception as e:
        raise HTTPException(500, str(e))


# ── video endpoint ────────────────────────────────────────────────────────────

@spaces.GPU(duration=300)
def _generate_video_gpu(prompt: str, num_frames: int) -> bytes:
    pipe = _load_cog()
    result = pipe(
        prompt=prompt, num_frames=num_frames,
        num_inference_steps=50, guidance_scale=6.0,
    )
    frames = result.frames[0]
    # export to mp4 bytes
    import tempfile
    from diffusers.utils import export_to_video
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
        tmp = f.name
    export_to_video(frames, tmp, fps=8)
    with open(tmp, "rb") as f:
        data = f.read()
    os.unlink(tmp)
    return data


@app.post("/v1/video/generations")
async def video_generations(req: VideoRequest):
    try:
        num_frames = min(max(req.duration, 2), 6) * 8   # 8 fps, max 6s
        vid_bytes = _generate_video_gpu(req.prompt, num_frames)
        b64 = base64.b64encode(vid_bytes).decode()
        return {
            "created": int(time.time()),
            "data": [{"b64_json": b64, "duration": req.duration}],
        }
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/health")
def health():
    return {"ok": True, "gpu": torch.cuda.is_available(), "space": "crane-gen"}


# ── Gradio wrapper (HF Spaces requires a Gradio or Streamlit interface) ───────

import gradio as gr

def _dummy(prompt: str) -> str:
    return f"CRANE ZeroGPU Space — API endpoint active. Use POST /v1/images/generations or POST /v1/video/generations.\n\nPrompt received: {prompt}"

demo = gr.Interface(fn=_dummy, inputs="text", outputs="text",
                    title="CRANE ZeroGPU Space",
                    description="OpenAI-compatible generation API. CRANE backend routes here when berylize-node is paused.")

# Mount FastAPI under Gradio
app = gr.mount_gradio_app(app, demo, path="/")
