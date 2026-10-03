/**
 * Beryl Mastering Suite — node-graph pipeline builder (ported from the "Beryl Mastering Suite" design).
 * Pick a model per stage, edit endpoint/port/key-env/budget, TEST each node for real, export the wiring spec.
 * The Agent/Brain node can use ANY Model Lab source (Kaggle default, NIM, HuggingFace, Ollama, llama.cpp).
 * Presets: BERYL (Kaggle brain, local voice) and TOKKIO BASELINE (Riva ASR -> Nemotron -> Riva TTS -> A2F -> Omniverse).
 * Backend: /api/lab/* (modellab.py). Keys are referenced by env-var NAME only; values never reach the browser.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import portrait from "../assets/beryl.jpg";

type Kind = "input" | "llm" | "voice" | "ctrl" | "render";
type Model = { n: string; d: string; port: number; proto: string; acc: string; ms: number; key: string; url?: string; lab?: { pipeline: string; model: string } };
type NodeDef = { id: string; tag: string; role: string; kind: Kind; stage: number; cin: string; cout: string; models: Model[] };
type Source = { name: string; host: string; model: string; online: boolean; models: string[] };
type Health = { state: "untested" | "testing" | "hot" | "down" | "client"; ms?: number; note?: string };

type DStage = { id: string; name: string; detail?: string; status: string; ms?: number; note?: string };
type DSlot = { slot: number; pid: string; name: string; stages: DStage[]; state: "running" | "live" | "partial"; summary?: string };
type Feed = { t: number; who: "LEAD" | "SYS"; text: string; errorCode?: string; resolvedBy?: string };
type Incident = { id: string; node: string; tag: string; start: number; end?: number; error: string; code: string; rounds: number; resolvedBy?: string; feed: Feed[] };
const DOCS = "https://docs.nvidia.com/ace/latest/workflows/tokkio/";
const GUIDE: [string, string][] = [["Tokkio overview", DOCS + "index.html"], ["Quickstart (one command)", DOCS + "quickstart.html"], ["Prerequisites + NGC key", DOCS + "prerequisites.html"],
  ["Architecture overview", DOCS + "architecture.html"], ["Latency budget", DOCS + "latency.html"], ["Deployment guide", DOCS + "deployment.html"], ["GCP deployment (closest to berylize-node)", DOCS + "gcp-deployment.html"],
  ["Troubleshooting", DOCS + "troubleshooting.html"], ["Digital Human Blueprint (GitHub)", "https://github.com/NVIDIA-AI-Blueprints/digital-human"], ["NVIDIA/ACE (GitHub)", "https://github.com/NVIDIA/ACE"],
  ["Live Tokkio demo (no signup)", "https://build.nvidia.com/explore/virtual-assistant"]];
const NODE_GUIDE: Record<string, [string, string]> = { mic: ["Barge-in / VAD", DOCS + "barge-in.html"], asr: ["Riva ASR config", DOCS + "riva-asr.html"], agt: ["Nemotron integration", DOCS + "nemotron.html"],
  tts: ["Riva TTS config", DOCS + "riva-tts.html"], a2f: ["Audio2Face overview", DOCS + "audio2face.html"], anm: ["AnimGraph", DOCS + "animgraph.html"], ips: ["WebRTC integration", DOCS + "webrtc.html"],
  ov: ["Streaming video", DOCS + "streaming-video.html"], bus: ["Latency budget", DOCS + "latency.html"] };
// Estimated VRAM (GB) of self-hosted GPU models, and GPU host capacity. Estimates, not live telemetry.
const VRAM: Record<string, number> = { "kaggle/crane-agent": 22, "kaggle/crane-chat": 6, "berylize/Qwen/Qwen2.5-Coder-14B-Instruct-AWQ": 10 };
const GPU_HOST: Record<string, [string, number]> = { kaggle: ["Kaggle 2×T4", 32], berylize: ["berylize-node L4", 24] };
const byIdN = (id: string) => N.find(n => n.id === id)!;
const fmt = (ms: number) => { const t = Math.floor(ms / 1000); return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
const K: Record<Kind, [string, string, string]> = {
  input: ["linear-gradient(135deg,#3b82f6,#93c5fd)", "rgba(59,130,246,.2)", "#93c5fd"],
  llm: ["linear-gradient(135deg,#a8782f,#f6e2a8 50%,#a8782f)", "rgba(238,202,80,.18)", "#f6d775"],
  voice: ["linear-gradient(135deg,#7c3aed,#c4b5fd)", "rgba(124,58,237,.22)", "#c4b5fd"],
  ctrl: ["linear-gradient(135deg,#059669,#6ee7b7)", "rgba(16,185,129,.2)", "#6ee7b7"],
  render: ["linear-gradient(135deg,#e11d48,#fda4af)", "rgba(244,63,94,.2)", "#fda4af"],
};
const NIM = "https://grpc.nvcf.nvidia.com:443";
const N: NodeDef[] = [
  { id: "mic", tag: "MIC", role: "Mic Ingress", kind: "input", stage: 0, cin: "user audio", cout: "pcm16 16k", models: [
    { n: "Browser WebRTC", d: "VAD · opus 16kHz", port: 0, proto: "client", acc: "Client", ms: 20, key: "" },
    { n: "LiveKit Ingress", d: "SFU · multi-user", port: 7880, proto: "WebRTC", acc: "CPU", ms: 35, key: "LIVEKIT_KEY" }] },
  { id: "asr", tag: "ASR", role: "Speech Recognition", kind: "input", stage: 1, cin: "pcm16 16k", cout: "text/partial", models: [
    { n: "Riva ASR", d: "Tokkio · NIM gRPC", port: 443, proto: "gRPC", acc: "GPU", ms: 100, key: "NGC_API_KEY", url: NIM },
    { n: "Whisper v3 Turbo", d: "local · CPU int8", port: 8002, proto: "REST", acc: "CPU", ms: 180, key: "" },
    { n: "Parakeet TDT", d: "streaming · local", port: 8003, proto: "WS", acc: "CPU", ms: 90, key: "" }] },
  { id: "agt", tag: "LLM", role: "Agent / Brain", kind: "llm", stage: 1, cin: "text", cout: "text/stream", models: [
    { n: "Kaggle crane-agent", d: "Qwen3-Coder 30B · 2×T4 (default)", port: 443, proto: "OpenAI-compat", acc: "GPU", ms: 420, key: "", lab: { pipeline: "kaggle", model: "crane-agent" } },
    { n: "Kaggle crane-chat", d: "Dolphin 3 8B · uncensored chat", port: 443, proto: "OpenAI-compat", acc: "GPU", ms: 350, key: "", lab: { pipeline: "kaggle", model: "crane-chat" } },
    { n: "Nemotron Agent", d: "Tokkio · NIM Nemotron", port: 443, proto: "OpenAI-compat", acc: "GPU", ms: 350, key: "NGC_ENTERPRISE_KEY", lab: { pipeline: "nim-enterprise", model: "nvidia/nemotron-3.5-lightning-30b-a3b" } },
    { n: "Berylize 7B", d: "local · Ollama CPU", port: 11434, proto: "OpenAI-compat", acc: "CPU", ms: 350, key: "", lab: { pipeline: "local", model: "dolphin3:8b" } },
    { n: "Qwen2.5-Coder 32B", d: "HuggingFace router", port: 443, proto: "OpenAI-compat", acc: "Cloud", ms: 600, key: "HUGGINGFACE_API_KEY", lab: { pipeline: "huggingface", model: "Qwen/Qwen2.5-Coder-32B-Instruct" } },
    { n: "llama.cpp GGUF", d: "llama-server :8080", port: 8080, proto: "OpenAI-compat", acc: "CPU", ms: 400, key: "", lab: { pipeline: "llamacpp", model: "local-gguf" } }] },
  { id: "tts", tag: "TTS", role: "Voice Synthesis", kind: "voice", stage: 1, cin: "text/stream", cout: "pcm24k", models: [
    { n: "Kokoro 82M", d: "voice cloning · local", port: 8012, proto: "REST", acc: "CPU", ms: 160, key: "" },
    { n: "Riva TTS", d: "Tokkio · NIM neural TTS", port: 443, proto: "gRPC", acc: "GPU", ms: 160, key: "NGC_API_KEY", url: NIM },
    { n: "XTTS v2", d: "multilingual clone", port: 8013, proto: "REST", acc: "GPU", ms: 220, key: "" },
    { n: "Browser voice", d: "speechSynthesis · built in", port: 0, proto: "client", acc: "Client", ms: 120, key: "" }] },
  { id: "a2f", tag: "A2F", role: "Audio → Face", kind: "voice", stage: 1, cin: "pcm24k", cout: "arkit52", models: [
    { n: "Audio2Face-3D", d: "Tokkio · ARKit 52 blendshapes", port: 443, proto: "gRPC", acc: "GPU", ms: 40, key: "NGC_API_KEY", url: NIM },
    { n: "Local Visemes", d: "phoneme map · CPU", port: 8014, proto: "WS", acc: "CPU", ms: 25, key: "" }] },
  { id: "anm", tag: "ANM", role: "Animation Graph", kind: "voice", stage: 1, cin: "arkit52", cout: "pose graph", models: [
    { n: "AnimGraph", d: "pose graph · blend", port: 8015, proto: "WS", acc: "CPU", ms: 33, key: "" },
    { n: "VRM Driver", d: "three.js · in-browser", port: 0, proto: "client", acc: "Client", ms: 16, key: "" }] },
  { id: "ips", tag: "IPS", role: "Instant Presence", kind: "ctrl", stage: 0, cin: "pose graph", cout: "video frames", models: [
    { n: "Mirror Loop", d: "L0 idle · always live", port: 0, proto: "client", acc: "CPU", ms: 80, key: "" },
    { n: "Neural Talking-Head", d: "real-time · GPU", port: 8021, proto: "WebRTC", acc: "GPU", ms: 120, key: "" }] },
  { id: "ov", tag: "OV", role: "Omniverse Stream", kind: "render", stage: 2, cin: "pose graph", cout: "pixel stream", models: [
    { n: "Omniverse Kit", d: "Tokkio · L2 cinematic RTX", port: 8030, proto: "WebRTC", acc: "GPU", ms: 50, key: "" },
    { n: "Unreal Pixel Stream", d: "MetaHuman", port: 8031, proto: "WebRTC", acc: "GPU", ms: 70, key: "" }] },
  { id: "bus", tag: "BUS", role: "Spatial Syncer", kind: "ctrl", stage: 0, cin: "all streams", cout: "media clock", models: [
    { n: "Media Clock", d: "stage bus · clock", port: 0, proto: "client", acc: "Client", ms: 0, key: "" }] },
];
const E: [string, string, string][] = [["mic", "asr", "transcribe"], ["asr", "agt", "think"], ["agt", "tts", "speak"], ["tts", "a2f", "visemes"], ["a2f", "anm", "pose"],
  ["anm", "ips", "render"], ["bus", "mic", ""], ["bus", "ips", ""], ["bus", "ov", ""], ["ov", "ips", ""]];
const ST: [string, string, string][] = [["L0", "Idle Presence", "Instant Presence"], ["L1", "Audio2Face", "Audio2Face Live"], ["L2", "Omniverse", "Omniverse Cinematic"]];
const SH = ["eyeBlink_L", "eyeBlink_R", "jawOpen", "mouthSmile_L", "mouthSmile_R", "browInnerUp", "cheekPuff", "noseSneer_L"];
const SHAPES: [string, string, string][] = [["circle", "○", "Circle"], ["rect", "▭", "Rectangle"], ["vertical", "▯", "Vertical"], ["triangle", "△", "Triangle"]];
const PRESETS: Record<string, { stage: number; pick: Record<string, string> }> = {
  beryl: { stage: 1, pick: { mic: "Browser WebRTC", asr: "Whisper v3 Turbo", agt: "Kaggle crane-agent", tts: "Kokoro 82M", a2f: "Local Visemes", anm: "AnimGraph", ips: "Mirror Loop" } },
  tokkio: { stage: 2, pick: { mic: "Browser WebRTC", asr: "Riva ASR", agt: "Nemotron Agent", tts: "Riva TTS", a2f: "Audio2Face-3D", anm: "AnimGraph", ips: "Mirror Loop", ov: "Omniverse Kit" } },
};
const TOKKIO_BUDGET_MS = 1450;

function layout(shape: string): { W: number; H: number; P: Record<string, [number, number]> } {
  const ids = ["mic", "asr", "agt", "tts", "a2f", "anm", "ips", "ov"], P: Record<string, [number, number]> = {};
  if (shape === "circle") { ids.forEach((id, i) => { const t = i * Math.PI / 4; P[id] = [640 - 500 * Math.cos(t), 410 - 330 * Math.sin(t)]; }); P.bus = [640, 410]; return { W: 1280, H: 820, P }; }
  if (shape === "rect") { Object.assign(P, { mic: [220, 130], asr: [640, 130], agt: [1060, 130], tts: [1060, 410], a2f: [1060, 690], anm: [640, 690], ips: [220, 690], ov: [220, 410], bus: [640, 410] }); return { W: 1280, H: 820, P }; }
  if (shape === "vertical") { ["mic", "asr", "agt", "tts", "a2f", "anm", "ips"].forEach((id, i) => { P[id] = [330, 100 + i * 240]; }); P.bus = [800, 580]; P.ov = [800, 1300]; return { W: 1060, H: 1700, P }; }
  Object.assign(P, { agt: [640, 100], asr: [400, 330], tts: [880, 330], mic: [200, 560], bus: [640, 560], a2f: [1080, 560], ov: [400, 790], ips: [640, 1020], anm: [880, 790] });
  return { W: 1280, H: 1120, P };
}

const RED = "#ff1f3d", GREEN = "#00ff7f";
const GOLD = "#d9b45a", MUTED = "#8a8290", CARD = "#140a20", BORDER = "#2a1e36", FG = "#ece6f2", OK = "#34d399", BAD = "#f87171", WARN = "#fbbf24";
const inp: React.CSSProperties = { background: "#0c0614", border: `1px solid ${BORDER}`, color: FG, borderRadius: 5, padding: "6px 9px", fontSize: 12, width: "100%", fontFamily: "monospace" };
const btn = (on = false): React.CSSProperties => ({ background: on ? GOLD : CARD, color: on ? "#1a1024" : FG, border: `1px solid ${on ? GOLD : BORDER}`,
  borderRadius: 6, padding: "6px 12px", fontWeight: 700, fontSize: 11, cursor: "pointer", letterSpacing: ".06em" });
const lbl: React.CSSProperties = { fontSize: 9, color: MUTED, letterSpacing: ".12em", fontFamily: "monospace" };
const store = { get: (): { shape?: string; stage?: number; pick?: Record<string, string>; over?: Record<string, string> } => { try { return JSON.parse(localStorage.getItem("beryl-suite") || "{}"); } catch { return {}; } },
  set: (v: unknown) => { try { localStorage.setItem("beryl-suite", JSON.stringify(v)); } catch { /* storage unavailable */ } } };

export default function BerylSuite({ open, onClose }: { open: boolean; onClose: () => void }) {
  const saved = useMemo(() => store.get(), []);
  const [shape, setShape] = useState(saved.shape || "circle");
  const [zoom, setZoom] = useState(1);
  const [stage, setStage] = useState(saved.stage ?? 1);
  const [sel, setSel] = useState("agt");
  const [pick, setPick] = useState<Record<string, string>>(saved.pick || {});     // node id -> model name
  const [over, setOver] = useState<Record<string, string>>(saved.over || {});     // "node.field" -> value
  const [tab, setTab] = useState<"inspector" | "wiring" | "triage">("inspector");
  const [health, setHealth] = useState<Record<string, Health>>({});
  const [sources, setSources] = useState<Source[]>([]);
  const [online, setOnline] = useState(false);
  const [toast, setToast] = useState("Select a node, swap its model, TEST it, copy the wiring spec.");
  const [talking, setTalking] = useState(false);
  const [bs, setBs] = useState<number[]>(SH.map(() => 0));
  const [wrap, setWrap] = useState({ w: 600, h: 400 });
  const [custom, setCustom] = useState({ pipeline: "huggingface", model: "" });
  const [extra, setExtra] = useState<Model[]>([]);
  const [dpl, setDpl] = useState("nvidia-prebuilt");
  const [dplList, setDplList] = useState<{ id: string; name: string; description: string }[]>([{ id: "nvidia-prebuilt", name: "NVIDIA PRE-BUILT (Tokkio NIM)", description: "" }]);
  const [slots, setSlots] = useState<DSlot[]>([]);
  const [dplOpen, setDplOpen] = useState(false);
  const autoRan = useRef(false);
  const [connected, setConnected] = useState(true);
  const [inspOpen, setInspOpen] = useState(true);
  const [gpuMeter, setGpuMeter] = useState<{ status: string; util?: number; mem_used_mb?: number; mem_total_mb?: number; temp?: number; power_w?: number; cost_usd?: number; uptime_h?: number } | null>(null);
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState("");
  const recRef = useRef<{ stop: () => void } | null>(null);
  const [clk, setClk] = useState({ drift: 0, skew: 0 });
  const tick = useRef({ t0: 0, n: 0, last: 0 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const talkRef = useRef(false);
  talkRef.current = talking;

  useEffect(() => { store.set({ shape, stage, pick, over }); }, [shape, stage, pick, over]);

  const modelsOf = useCallback((n: NodeDef): Model[] => (n.id === "agt" ? [...n.models, ...extra] : n.models), [extra]);
  const modelOf = useCallback((n: NodeDef): Model => { const ms = modelsOf(n); return ms.find(m => m.n === pick[n.id]) || ms[0]; }, [modelsOf, pick]);
  const ov = (n: NodeDef, f: string, def: string | number) => over[`${n.id}.${f}`] ?? String(def);
  const endpointOf = (n: NodeDef): string => { const m = modelOf(n); if (m.lab) { const s = sources.find(x => x.name === m.lab!.pipeline); return s ? `${s.host}` : m.lab.pipeline; }
    return m.url || (m.port ? `http://localhost:${m.port}` : "in-browser"); };
  const active = useMemo(() => N.filter(n => n.stage <= stage).sort((a, b) => a.stage - b.stage), [stage]);

  // ---- data
  const loadSources = useCallback(async () => {
    try { const r = await fetch("/api/lab/sources"); const d = await r.json(); setSources(d.pipelines); setOnline(true); } catch { setOnline(false); }
  }, []);
  useEffect(() => { if (open) loadSources(); }, [open, loadSources]);

  const testNode = useCallback(async (n: NodeDef) => {
    const m = modelOf(n);
    setHealth(h => ({ ...h, [n.id]: { state: "testing" } }));
    try {
      if (m.proto === "client" || (!m.port && !m.url && !m.lab)) { setHealth(h => ({ ...h, [n.id]: { state: "client", note: "runs in the browser" } })); return "runs in the browser"; }
      if (m.lab) {
        const r = await (await fetch("/api/lab/compare", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: "Reply with one short sentence.", max_tokens: 120, temperature: 0.2, targets: [m.lab] }) })).json();
        const x = r.results[0];
        if (x.ok) { const note = `TTFT ${x.ttft_ms}ms · ${x.tok_s ?? "–"} tok/s`; setHealth(h => ({ ...h, [n.id]: { state: "hot", ms: x.ttft_ms, note } })); return `${m.n}: ${note}`; }
        setHealth(h => ({ ...h, [n.id]: { state: "down", note: x.error } })); return `${m.n} failed: ${x.error}`;
      }
      const r = await fetch("/api/lab/probe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: ov(n, "endpoint", endpointOf(n)) }) });
      const d = await r.json();
      if (d.ok) { setHealth(h => ({ ...h, [n.id]: { state: "hot", ms: d.ms, note: `reachable in ${d.ms}ms` } })); return `${m.n}: reachable in ${d.ms}ms (connection only, not a login check)`; }
      setHealth(h => ({ ...h, [n.id]: { state: "down", note: d.error || d.detail } })); return `${m.n}: not reachable at ${d.host}:${d.port}`;
    } catch (e) { setHealth(h => ({ ...h, [n.id]: { state: "down", note: (e as Error).message } })); return `${m.n}: test failed`; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelOf, over, sources]);
  const testAll = async () => { setToast("Testing every active node…"); const out: string[] = []; for (const n of active) out.push(await testNode(n)); setToast(`Tested ${active.length} nodes: ${out.filter(s => /reachable in|TTFT|browser/.test(s)).length} up`); };
  useEffect(() => { if (open && online) { active.forEach(n => { if (!health[n.id]) testNode(n); }); } /* first sweep only */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, online]);

  // ---- GPU meter — polls /api/gpu/status every 5s while suite is open
  useEffect(() => {
    if (!open) return;
    const poll = () => fetch("/api/gpu/status").then(r => r.json()).then(d => setGpuMeter({ status: d.instance_status, util: d.gpu_util, mem_used_mb: d.mem_used_mb, mem_total_mb: d.mem_total_mb, temp: d.gpu_temp_c, power_w: d.power_w, cost_usd: d.cost_usd, uptime_h: d.uptime_h })).catch(() => setGpuMeter(g => g ? { ...g } : null));
    poll(); const t = setInterval(poll, 5000); return () => clearInterval(t);
  }, [open]);

  // ---- one-click deploy (SSE from /api/deploy/stream)
  useEffect(() => { if (open) fetch("/api/deploy/pipelines").then(r => r.json()).then(d => d.pipelines?.length && setDplList(d.pipelines)).catch(() => {}); }, [open]);
  const deploy = useCallback((pid: string) => {
    const slot = slots.length + 1; setDplOpen(true); setConnected(true);
    const upd = (f: (d: DSlot) => DSlot) => setSlots(ss => ss.map(d => d.slot === slot ? f(d) : d));
    setSlots(ss => [...ss, { slot, pid, name: pid, stages: [], state: "running" }]);
    if (pid === "nvidia-prebuilt") { const p = PRESETS.tokkio; setStage(p.stage); setPick(p.pick); setOver({}); }
    const es = new EventSource(`/api/deploy/stream/${pid}?slot=${slot}`);
    const nodeOf: Record<string, string> = { llm: "agt" };
    es.onmessage = m => {
      const e = JSON.parse(m.data);
      if (e.event === "start") upd(d => ({ ...d, name: e.name, stages: e.stages.map((x: DStage) => ({ ...x, status: "wait" })) }));
      else if (e.event === "stage") {
        upd(d => ({ ...d, stages: d.stages.map(x => x.id === e.id ? { ...x, status: e.status, ms: e.ms, note: e.note } : x) }));
        const nid = nodeOf[e.id] || e.id;
        if (e.status === "live") setHealth(h => ({ ...h, [nid]: { state: e.note === "client-side" ? "client" : "hot", ms: e.ms, note: e.note } }));
        else if (e.status === "down") setHealth(h => ({ ...h, [nid]: { state: "down", note: e.note } }));
      } else if (e.event === "done") { upd(d => ({ ...d, state: e.core_ready ? "live" : "partial", summary: e.summary })); es.close(); setToast(e.summary); }
    };
    es.onerror = () => { upd(d => ({ ...d, state: "partial", summary: "Lost the CRANE server connection" })); es.close(); };
  }, [slots.length]);
  useEffect(() => { if (open && online && !autoRan.current) { autoRan.current = true; deploy("nvidia-prebuilt"); } }, [open, online, deploy]);

  // ---- triage: incident timer + agentic lead feed
  const [incs, setIncs] = useState<Incident[]>(() => { try { return JSON.parse(localStorage.getItem("beryl-incidents") || "[]"); } catch { return []; } });
  useEffect(() => { try { localStorage.setItem("beryl-incidents", JSON.stringify(incs.slice(-200))); } catch { /* storage off */ } }, [incs]);
  const openIncs = incs.filter(i => !i.end);
  const openRef = useRef<string[]>([]); openRef.current = openIncs.map(i => i.node);
  const [feed, setFeed] = useState<Feed[]>([]);
  const [nowT, setNowT] = useState(Date.now());
  const [autoRetry, setAutoRetry] = useState(true);
  const [triageOpen, setTriageOpen] = useState(true);
  const lastLead = useRef(0);
  const testRef = useRef(testNode); testRef.current = testNode;
  const post = useCallback((who: Feed["who"], text: string, errorCode?: string, resolvedBy?: string) => setFeed(f => [...f.slice(-40), { t: Date.now(), who, text, errorCode, resolvedBy }]), []);
  const addLine = useCallback((nodes: string[], who: Feed["who"], text: string, errorCode?: string, resolvedBy?: string) =>
    setIncs(a => a.map(i => !i.end && nodes.includes(i.node) ? { ...i, feed: [...i.feed.slice(-60), { t: Date.now(), who, text, errorCode, resolvedBy }] } : i)), []);
  const extractCode = (note?: string): string => {
    if (!note) return "UNKNOWN";
    if (/not set/i.test(note)) return "NO_API_KEY";
    if (/401/.test(note)) return "HTTP_401_UNAUTHORIZED";
    if (/403/.test(note)) return "HTTP_403_FORBIDDEN";
    if (/404/.test(note)) return "HTTP_404_NOT_FOUND";
    if (/503/.test(note)) return "HTTP_503_UNAVAILABLE";
    if (/timeout/i.test(note)) return "TIMEOUT";
    if (/unreachable|connection refused|refused/i.test(note)) return "CONNECTION_REFUSED";
    if (/reset by peer/i.test(note)) return "CONNECTION_RESET";
    if (/dns|resolve/i.test(note)) return "DNS_FAILURE";
    if (/ssl|tls|certificate/i.test(note)) return "TLS_ERROR";
    if (/no.*listen|nothing.*listen/i.test(note)) return "PORT_NOT_LISTENING";
    return "SERVICE_ERROR";
  };
  const downIds = active.filter(n => health[n.id]?.state === "down").map(n => n.id);
  const downKey = downIds.join(",");
  const slowIds = active.filter(n => { const h = health[n.id]; return h?.state === "hot" && !!h.ms && h.ms > Number(ov(n, "budget", modelOf(n).ms * 2 || 50)); }).map(n => n.id);
  const slowKey = slowIds.join(",");
  const prevSlow = useRef<string[]>([]);
  useEffect(() => {
    const added = slowIds.filter(i => !prevSlow.current.includes(i)); prevSlow.current = slowIds;
    added.forEach(i => { const n = byIdN(i), m = modelOf(n), ms = health[i].ms!, b = Number(ov(n, "budget", m.ms * 2 || 50));
      post("LEAD", `${n.tag} ${m.n} is SLOW: ${ms}ms against a ${b}ms budget. ${m.acc === "Cloud" || m.url ? "Shared cloud capacity is the limit here; move this node to the Kaggle GPU for guaranteed power." : m.acc === "CPU" ? "It is running on CPU; move it to a GPU host." : "Check GPU load on its host, or raise the budget if this is a cold start."}`); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slowKey]);
  const gpuUse = Object.entries(active.reduce<Record<string, { gb: number; names: string[] }>>((a, n) => { const m = modelOf(n); if (!m.lab) return a;
    const k = `${m.lab.pipeline}/${m.lab.model}`, gb = VRAM[k]; if (!gb) return a; const host = m.lab.pipeline; (a[host] ||= { gb: 0, names: [] }).gb += gb; a[host].names.push(m.n); return a; }, {}));
  const diagnose = (n: NodeDef): string => {
    const m = modelOf(n), note = health[n.id]?.note || "";
    if (/not set/i.test(note)) return `${n.tag} ${m.n}: API key missing. Run scripts/setup_enterprise_keys.sh.`;
    if (/401|403|auth/i.test(note)) return `${n.tag} ${m.n}: key rejected by the provider. Re-enter it with scripts/setup_enterprise_keys.sh.`;
    if (m.lab?.pipeline === "kaggle") return `${n.tag} ${m.n}: Kaggle tunnel is offline (the URL changes each notebook session). Restart the notebook, then run: bash scripts/kaggle_ops.sh sync.`;
    if (m.lab?.pipeline === "local") return `${n.tag} ${m.n}: Ollama is not answering. Run: ollama serve.`;
    if (m.lab?.pipeline === "llamacpp") return `${n.tag} ${m.n}: no llama-server on :8080. Start one: llama-server -m model.gguf --port 8080.`;
    if (m.port && !m.url && !m.lab) return `${n.tag} ${m.n}: nothing is listening on port ${m.port}. Start that service, or swap this node to a client-side model.`;
    return `${n.tag} ${m.n}: unreachable${note ? ` (${note})` : ""}. Press Test to retry.`;
  };
  const askLead = (ids: string[]) => {
    const list = ids.map(i => { const n = byIdN(i), m = modelOf(n); return `${n.tag} (${m.n}, port ${m.port || "none"}${health[i]?.note ? `, error: ${health[i].note}` : ""})`; }).join("; ");
    const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/avatar-chat`); let buf = "";
    const kill = setTimeout(() => ws.close(), 90000);
    ws.onopen = () => ws.send(JSON.stringify({ message: `You are the triage lead for a live avatar pipeline. These nodes are DOWN: ${list}. In at most two short sentences give the most likely single root cause and the one next action. No greeting, no markdown.` }));
    ws.onmessage = m => { const d = JSON.parse(m.data); if (d.type === "token") buf += d.delta; else if (d.type === "done" || d.type === "error") { clearTimeout(kill); if (d.type === "done" && buf.trim()) addLine(ids, "LEAD", buf.trim()); ws.close(); } };
  };
  const stateKey = openIncs.map(i => health[i.node]?.state).join(",");
  useEffect(() => {
    if (!open || !connected) return;
    const openNow = incs.filter(i => !i.end).map(i => i.node);
    const created = downIds.filter(i => !openNow.includes(i));
    if (created.length) {
      const t = Date.now();
      const fresh: Incident[] = created.map(i => { const n = byIdN(i), note = health[i]?.note || "", code = extractCode(note);
        return { id: `${i}-${t}`, node: i, tag: n.tag, start: t, error: note, code, rounds: 0,
          feed: [{ t, who: "SYS", text: `${n.tag} went red.`, errorCode: code }, { t, who: "LEAD", text: diagnose(n) }] }; });
      setIncs(a => [...a, ...fresh.filter(f => !a.some(x => !x.end && x.node === f.node))]);
      if (Date.now() - lastLead.current > 30000) { lastLead.current = Date.now(); askLead(created); }
    }
    const healed = incs.filter(i => !i.end && !downIds.includes(i.node) && ["hot", "client"].includes(health[i.node]?.state ?? ""));
    if (healed.length) {
      const t = Date.now();
      const closed = healed.map(i => { const by = i.rounds > 0 ? "auto-retest" : "manual-test";
        return { ...i, end: t, resolvedBy: by, feed: [...i.feed, { t, who: "SYS" as const, text: `${i.tag} recovered after ${fmt(t - i.start)}.`, resolvedBy: by }] }; });
      setIncs(a => a.map(i => closed.find(c => c.id === i.id) || i));
      closed.forEach(c => fetch("/api/reports/triage", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipeline: dpl, opened_at_iso: new Date(c.start).toISOString(), cleared_at_iso: new Date(c.end!).toISOString(), duration_ms: c.end! - c.start,
          nodes: [{ id: c.node, tag: c.tag, error: c.error, error_code: c.code, resolved_at_iso: new Date(c.end!).toISOString(), resolved_by: c.resolvedBy }],
          feed_summary: c.feed.map(f => `${f.who}: ${f.text}`), gpu_host: "berylize-node (GCP L4)" }) }).catch(() => {}));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [downKey, stateKey, open, connected]);
  useEffect(() => { if (!openIncs.length) return; const t = setInterval(() => setNowT(Date.now()), 1000); return () => clearInterval(t); }, [openIncs.length]);
  // Auto-route bottom panel: triage when red, inspector when all clear
  useEffect(() => {
    if (openIncs.length > 0) { setTab("triage"); setInspOpen(true); }
    else if (tab === "triage") setTab("inspector");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openIncs.length]);
  useEffect(() => {
    if (!openIncs.length || !autoRetry || !connected) return;
    const t = setInterval(async () => {
      const ids = [...openRef.current];
      setIncs(a => a.map(i => !i.end ? { ...i, rounds: i.rounds + 1 } : i));
      for (const id of ids) { const r = await testRef.current(byIdN(id)); addLine([id], "SYS", `Auto-retest: ${/reachable in|TTFT|browser/.test(r) ? "passed" : "still down"}.`); }
    }, 20000);
    return () => clearInterval(t);
  }, [openIncs.length, autoRetry, connected, addLine]);

  // ---- layout + animation
  useEffect(() => {
    if (!open || !wrapRef.current) return;
    const el = wrapRef.current; const fit = () => setWrap({ w: el.clientWidth, h: el.clientHeight });
    fit(); const ro = new ResizeObserver(fit); ro.observe(el); return () => ro.disconnect();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    tick.current = { t0: performance.now(), n: 0, last: performance.now() };
    const t = setInterval(() => { const k = tick.current, now = performance.now(); k.n++;
      setClk({ drift: now - k.t0 - k.n * 140, skew: now - k.last - 140 }); k.last = now;
      setBs(SH.map(n => { const t2 = talkRef.current;
      return n === "jawOpen" || n.startsWith("mouth") ? (t2 ? Math.random() * .8 : Math.random() * .03) : n.startsWith("eyeBlink") ? (Math.random() > .93 ? .9 : .03) : Math.random() * (t2 ? .25 : .03); })); }, 140);
    return () => clearInterval(t);
  }, [open]);

  const disconnect = () => { try { speechSynthesis.cancel(); } catch { /* none */ } setTalking(false); setHealth({}); setConnected(false); setToast("Disconnected. All nodes released. Press Connect to redeploy."); };
  const connect = () => { setConnected(true); deploy(dpl); };
  const swap = (n: NodeDef, name?: string) => {
    const ms = modelsOf(n); const cur = ms.findIndex(m => m.n === modelOf(n).n);
    setPick(p => ({ ...p, [n.id]: name ?? ms[(cur + 1) % ms.length].n })); setSel(n.id);
    setOver(o => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith(n.id + "."))));
    setHealth(h => ({ ...h, [n.id]: { state: "untested" } }));
  };
  const applyPreset = (k: "beryl" | "tokkio") => {
    const p = PRESETS[k]; setStage(p.stage); setPick(p.pick); setOver({});
    setHealth({}); setToast(k === "tokkio" ? "NVIDIA Tokkio baseline loaded: Riva ASR → Nemotron → Riva TTS → Audio2Face-3D → Omniverse. Press TEST ALL." : "Beryl pipeline loaded (Kaggle brain, local voice). Press TEST ALL.");
  };
  const addCustom = () => {
    const m = custom.model.trim(); if (!m) return;
    const nm: Model = { n: `${custom.pipeline} · ${m.split("/").pop()}`, d: `Model Lab · ${m}`, port: 443, proto: "OpenAI-compat", acc: "Cloud", ms: 500, key: "", lab: { pipeline: custom.pipeline, model: m } };
    setExtra(x => x.some(e => e.n === nm.n) ? x : [...x, nm]); swap(N.find(n => n.id === "agt")!, nm.n); setCustom(c => ({ ...c, model: "" }));
  };

  const spec = useMemo(() => {
    const nodes = active.map(n => { const m = modelOf(n); return { id: n.id, role: n.role, model: m.n, accelerator: m.acc, protocol: m.proto,
      endpoint: ov(n, "endpoint", endpointOf(n)), port: Number(ov(n, "port", m.port)), apiKeyEnv: ov(n, "key", m.key) || null,
      latencyBudgetMs: Number(ov(n, "budget", (m.ms * 2) || 50)), contract: { in: n.cin, out: n.cout }, warm: n.stage === 0 ? "always" : "on-demand",
      ...(m.lab ? { modelLab: m.lab } : {}) }; });
    const ids = nodes.map(n => n.id);
    return { project: "beryl-mastering-suite", stage: ST[stage][0], controlPlaneBudgetMs: 1000, nodes,
      edges: E.filter(e => ids.includes(e[0]) && ids.includes(e[1])).map(e => ({ from: e[0], to: e[1], channel: e[2] || "clock" })),
      swapRule: "Replace a node model freely as long as contract.in/out match; only endpoint, port, apiKeyEnv change." };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, pick, over, stage, extra, sources]);
  // ---- pipeline code generator — real connection code per cluster, no LLM
  const pipelineCode = useMemo(() => {
    const nodes = spec.nodes;
    const edges = spec.edges;

    // group nodes by stage/cluster for section headers
    const clusters: Record<string, typeof nodes> = {};
    nodes.forEach(n => {
      const nd = N.find(x => x.id === n.id)!;
      const cl = nd.stage === 0 ? "L0 · Always-Hot (control plane)" : nd.stage === 2 ? "L2 · Omniverse (GPU render)" : "L1 · On-Demand (signal path)";
      (clusters[cl] ||= []).push(n);
    });

    const nodeCode = (n: typeof nodes[0]): string => {
      const h = health[n.id];
      const status = h ? (h.state === "hot" ? `# ✓ HOT ${h.ms ? h.ms + "ms" : ""}` : h.state === "down" ? `# ✗ DOWN — ${h.note || "untested"}` : h.state === "client" ? "# CLIENT-SIDE" : "# untested") : "# untested";
      const keyLine = n.apiKeyEnv ? `\n    api_key = os.environ["${n.apiKeyEnv}"]` : "";
      const endpointLine = n.endpoint ? `\n    endpoint = "${n.endpoint}"` : "";
      const portLine = n.port ? `\n    port = ${n.port}` : "";

      if (n.protocol === "client" || n.warm === "always" && !n.port) {
        return `# ── ${n.id.toUpperCase()} · ${n.role} ${status}\n# Runs in the browser (WebRTC / WebAudio). No server connection needed.\n# contract: ${n.contract.in} → ${n.contract.out}\n`;
      }
      if (n.protocol === "gRPC" || (n.endpoint || "").includes("grpc")) {
        return `# ── ${n.id.toUpperCase()} · ${n.role} ${status}
# contract: ${n.contract.in} → ${n.contract.out}
async def ${n.id}_call(data: bytes) -> bytes:${keyLine}${endpointLine}${portLine}
    creds = grpc.ssl_channel_credentials()
    meta = [("authorization", f"Bearer {api_key}")]
    async with grpc.aio.secure_channel(f"{'{'}endpoint{'}'}:{'{'}port{'}'}", creds) as ch:
        # stub = ${n.id.toUpperCase()}Stub(ch)   # import from NVIDIA ACE proto
        result = await stub.Process(Request(payload=data), metadata=meta)
    return result.payload
`;
      }
      if (n.protocol === "OpenAI-compat" || (n.modelLab)) {
        const model = n.modelLab?.model || n.model;
        return `# ── ${n.id.toUpperCase()} · ${n.role} ${status}
# contract: ${n.contract.in} → ${n.contract.out}
async def ${n.id}_call(messages: list[dict]) -> str:${keyLine}${endpointLine}${portLine}
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(
            f"https://{'{'}endpoint{'}'}/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={"model": "${model}", "messages": messages, "max_tokens": 512, "stream": False},
        )
        r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]
`;
      }
      if (n.protocol === "WebRTC" || n.protocol === "WS") {
        return `# ── ${n.id.toUpperCase()} · ${n.role} ${status}
# contract: ${n.contract.in} → ${n.contract.out}
async def ${n.id}_connect() -> None:${endpointLine}${portLine}
    uri = f"ws://{'{'}endpoint or 'localhost'{'}'}:{'{'}port{'}'}"
    async with websockets.connect(uri) as ws:
        await ws.send(json.dumps({"init": True}))
        msg = json.loads(await ws.recv())
    return msg
`;
      }
      return `# ── ${n.id.toUpperCase()} · ${n.role} ${status}\n# protocol: ${n.protocol} | endpoint: ${n.endpoint}:${n.port}\n`;
    };

    const edgeLines = edges.map(e => `    # ${e.from.toUpperCase()} ──[${e.channel}]──▶ ${e.to.toUpperCase()}`).join("\n");

    const sections = Object.entries(clusters).map(([cl, ns]) =>
      `# ${"═".repeat(60)}\n# CLUSTER: ${cl}\n# ${"═".repeat(60)}\n\n` + ns.map(nodeCode).join("\n")
    ).join("\n");

    return `"""
CRANE Beryl Pipeline — auto-generated connection code
Pipeline : ${spec.project}
Stage    : ${spec.stage}
Generated: ${new Date().toISOString()}

Install: pip install httpx grpcio grpcio-tools websockets
Keys   : source ~/.hermes/.env
"""
import asyncio, json, os
import grpc, grpc.aio
import httpx
import websockets

# ── Data-flow edges ──────────────────────────────────────────────────────────
# Signal flows through nodes in this order:
${edgeLines}

# ── Node implementations ─────────────────────────────────────────────────────
${sections}
# ── Pipeline runner ──────────────────────────────────────────────────────────
async def run_pipeline(audio_pcm: bytes) -> None:
${nodes.filter(n => n.protocol !== "client").map((n, i, arr) => {
  const prev = arr[i - 1];
  const fromVar = prev ? `${prev.id}_out` : "audio_pcm";
  return `    ${n.id}_out = await ${n.id}_call(${fromVar})`;
}).join("\n")}

if __name__ == "__main__":
    asyncio.run(run_pipeline(b""))  # replace b"" with real PCM audio bytes
`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec, health]);

  useEffect(() => { try { localStorage.setItem("beryl-pipeline-code", pipelineCode); } catch { /* storage off */ } }, [pipelineCode]);
  const copy = (txt: string, msg: string) => { try { navigator.clipboard.writeText(txt); } catch { /* clipboard blocked */ } setToast(msg); };
  const download = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(spec, null, 2)], { type: "application/json" })); a.download = "beryl.pipeline.json"; a.click(); };
  const say = (t: string) => { try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.onstart = () => setTalking(true); u.onend = () => setTalking(false); speechSynthesis.speak(u); } catch { /* no speech synthesis */ } };
  const ask = (text: string) => {
    setReply(""); setToast("Beryl is thinking…");
    const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/avatar-chat`); let buf = "";
    ws.onopen = () => ws.send(JSON.stringify({ message: text }));
    ws.onmessage = m => { const d = JSON.parse(m.data);
      if (d.type === "token") { buf += d.delta; setReply(buf); } else if (d.type === "done") { ws.close(); setToast("Beryl is speaking."); if (buf.trim()) say(buf); }
      else if (d.type === "error") { setToast(d.message); ws.close(); } };
    ws.onerror = () => setToast("Could not reach Beryl's brain (avatar socket).");
  };
  const listen = () => {
    if (recRef.current) { recRef.current.stop(); recRef.current = null; setToast("Stopped listening."); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setToast("This browser has no speech recognition. Use Chrome or Edge."); return; }
    const r = new SR(); r.lang = "en-US"; r.interimResults = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.onresult = (e: any) => { const t = Array.from(e.results as ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>).map(x => x[0].transcript).join(""); setHeard(t); if (e.results[e.results.length - 1].isFinal) ask(t); };
    r.onend = () => { recRef.current = null; }; r.onerror = () => { recRef.current = null; setToast("Mic blocked or unavailable. Allow microphone access."); };
    recRef.current = r; r.start(); setHeard(""); setToast("Listening… speak to Beryl.");
  };
  const speak = () => { try { const u = new SpeechSynthesisUtterance("Hi, I'm Beryl. This is the live studio."); u.onstart = () => setTalking(true); u.onend = () => setTalking(false); speechSynthesis.cancel(); speechSynthesis.speak(u); } catch { setTalking(t => !t); } };

  if (!open) return null;
  const LP = layout(shape);
  const fitK = Math.max(0.15, Math.min(1.1, Math.min((wrap.w - 4) / LP.W, (wrap.h - 4) / LP.H))), sc = fitK * zoom;
  const byId = Object.fromEntries(N.map(n => [n.id, n]));
  const stat = (n: NodeDef): [string, string] => { if (n.stage > stage) return ["COLD", "#6b6478"]; const h = health[n.id]?.state;
    if (h === "hot" && slowIds.includes(n.id)) return ["SLOW", WARN];
    return h === "hot" ? ["HOT", OK] : h === "client" ? ["CLIENT", "#93c5fd"] : h === "down" ? ["DOWN", BAD] : h === "testing" ? ["TESTING", WARN] : ["UNTESTED", WARN]; };
  const hotCount = active.filter(n => ["hot", "client"].includes(health[n.id]?.state || "")).length;
  const sn = byId[sel], sm = modelOf(sn), sk = K[sn.kind];
  const e2e = active.filter(n => ["asr", "agt", "tts", "a2f", "anm"].includes(n.id)).reduce((t, n) => t + modelOf(n).ms, 0) + (stage ? 0 : 80);
  const setF = (f: string) => (e: React.ChangeEvent<HTMLInputElement>) => setOver(o => ({ ...o, [`${sel}.${f}`]: e.target.value }));

  return (
    <div className="mastering-overlay" style={{ background: "#09060f" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 14, padding: "0 16px", height: 56, borderBottom: "1px solid rgba(255,255,255,.08)", background: "#0c0813", flex: "none" }}>
        <span style={{ fontFamily: "Georgia,serif", fontSize: 34, fontWeight: 700, color: GOLD, lineHeight: 1 }}>C</span>
        <div><div style={{ fontWeight: 800, letterSpacing: ".2em", color: GOLD, fontSize: 17 }}>BERYL MASTERING SUITE</div>
          <div style={{ ...lbl, letterSpacing: ".18em" }}>LIVE AVATAR PIPELINE · BERYL LABS</div></div>
        <div style={{ flex: 1 }} />
        <select value={dpl} onChange={e => setDpl(e.target.value)} style={{ ...inp, width: 250, fontWeight: 700 }} title="Pipeline to deploy">
          {dplList.map((p, i) => <option key={p.id} value={p.id}>{`#${i + 1} ${p.name}`}</option>)}
        </select>
        <button style={{ ...btn(true), background: "#76b900", borderColor: "#76b900", color: "#0b1200", padding: "8px 20px", fontSize: 13 }} onClick={() => deploy(dpl)}>▶ DEPLOY</button>
        <button style={btn(dplOpen)} onClick={() => setDplOpen(o => !o)}>SESSIONS {slots.length}</button>
        <select aria-label="NVIDIA guide" value="" style={{ ...btn(), borderColor: "#76b900", color: "#b6e35b", width: 130 }} onChange={e => { if (e.target.value) window.open(e.target.value, "_blank", "noopener,noreferrer"); }}>
          <option value="">NVIDIA GUIDE ↗</option>{GUIDE.map(g => <option key={g[1]} value={g[1]}>{g[0]}</option>)}</select>
        <span style={{ fontSize: 11, fontFamily: "monospace", color: online ? OK : BAD }}>● Backend {online ? "online" : "offline"} · localhost</span>
        {gpuMeter && (() => {
          const running = gpuMeter.status === "running";
          const uptimeSec = gpuMeter.uptime_h ? Math.round(gpuMeter.uptime_h * 3600) : 0;
          const hh = String(Math.floor(uptimeSec / 3600)).padStart(2, "0");
          const mm = String(Math.floor((uptimeSec % 3600) / 60)).padStart(2, "0");
          const ss = String(uptimeSec % 60).padStart(2, "0");
          return (
            <span title={`Vendor: GCP berylize-node | GPU: NVIDIA L4 24GB | Temp: ${gpuMeter.temp ?? "–"}°C | Power: ${gpuMeter.power_w?.toFixed(0) ?? "–"}W | Cost: $${gpuMeter.cost_usd?.toFixed(4) ?? "–"}`}
              style={{ fontSize: 11, fontFamily: "monospace", display: "flex", alignItems: "center", gap: 5, background: "#0f1a04", border: `1px solid ${running ? "#4a7a00" : "#5a3a00"}`, borderRadius: 6, padding: "3px 8px", cursor: "default" }}>
              <span style={{ color: running ? "#76b900" : "#ff8c00" }}>▣</span>
              <span style={{ color: running ? "#76b900" : "#ff8c00", fontWeight: 800 }}>GCP·L4</span>
              {running ? (
                <>
                  <span style={{ color: "#b6e35b" }}>{gpuMeter.util?.toFixed(0) ?? "0"}%</span>
                  <span style={{ color: "#8cc444" }}>{gpuMeter.mem_used_mb ? `${(gpuMeter.mem_used_mb / 1024).toFixed(1)}/${(gpuMeter.mem_total_mb! / 1024).toFixed(0)}GB` : "–"}</span>
                  <span style={{ color: "#5a8a20", borderLeft: "1px solid #2a4a10", paddingLeft: 5 }}>{hh}:{mm}:{ss}</span>
                  {gpuMeter.cost_usd != null && <span style={{ color: "#3a6a10" }}>${gpuMeter.cost_usd.toFixed(3)}</span>}
                </>
              ) : <span style={{ color: "#ff8c00" }}>{gpuMeter.status?.toUpperCase()}</span>}
            </span>
          );
        })()}
        <button style={btn(true)} onClick={connected ? disconnect : connect}>{connected ? "Disconnect" : "Connect"}</button>
        <button style={btn()} onClick={onClose} aria-label="Close">✕</button>
      </header>

      {dplOpen && slots.length > 0 && (
        <div style={{ flex: "none", display: "flex", gap: 10, padding: "10px 16px", overflowX: "auto", background: "#0c0813", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
          {slots.map(d => (
            <div key={d.slot} style={{ minWidth: 330, background: CARD, border: `1px solid ${d.state === "live" ? OK : d.state === "partial" ? WARN : BORDER}`, borderRadius: 8, padding: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 800 }}>
                <span style={{ color: GOLD }}>#{d.slot} {d.name}</span>
                <span style={{ color: d.state === "live" ? OK : d.state === "partial" ? WARN : MUTED }}>{d.state === "running" ? "CONNECTING…" : d.state === "live" ? "● LIVE" : "PARTIAL"}</span>
              </div>
              <div style={{ display: "flex", gap: 5, margin: "8px 0", flexWrap: "wrap" }}>
                {d.stages.map(x => { const c = x.status === "live" ? OK : x.status === "down" ? BAD : x.status === "skip" ? MUTED : x.status === "checking" ? WARN : "#3a2e46";
                  return <span key={x.id} title={x.note || x.detail} style={{ fontSize: 10, fontFamily: "monospace", border: `1px solid ${c}`, color: c, borderRadius: 4, padding: "2px 6px" }}>
                    {x.name}{x.status === "live" && x.ms ? ` ${x.ms}ms` : x.status === "skip" ? " skip" : ""}</span>; })}
              </div>
              {d.summary && <div style={{ ...lbl, color: FG }}>{d.summary}</div>}
              {d.stages.filter(x => x.status === "down").map(x => <div key={x.id} style={{ fontSize: 10, color: BAD }}>{x.name}: {x.note}</div>)}
            </div>
          ))}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "minmax(0,1fr) 450px" }}>
        {/* ── left: graph + inspector */}
        <div style={{ display: "grid", gridTemplateRows: "auto minmax(0,1fr) auto", minHeight: 0, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", flexWrap: "wrap" }}>
            <div><div style={{ fontWeight: 800, color: FG, fontSize: 13 }}>PIPELINE</div><div style={lbl}>{N.filter(n => n.stage <= stage).length} nodes · {ST[stage][0]} stage · {hotCount} up</div></div>
            {ST.map((s, i) => <button key={s[0]} style={btn(stage === i)} onClick={() => setStage(i)}>{s[0]} {s[1]}</button>)}
            <div style={{ flex: 1 }} />
            <button onClick={testAll} title="Click to re-test every active node" style={{ border: 0, cursor: "pointer", borderRadius: 999, padding: "6px 22px", fontFamily: "monospace", fontSize: 12, fontWeight: 700, letterSpacing: ".1em",
              color: "#fff", background: !connected ? "#3a2e46" : hotCount === active.length ? "linear-gradient(90deg,#3b82f6,#a78bfa)" : "linear-gradient(90deg,#92400e,#d97706)" }}>
              {!connected ? "Offline" : hotCount === active.length ? `All hot ${hotCount}/${active.length}` : `${hotCount}/${active.length} hot`}</button>
            <button style={btn()} onClick={() => applyPreset("beryl")} title="Kaggle brain, local voice">BERYL PRESET</button>
            <button style={{ ...btn(), borderColor: "#76b900", color: "#b6e35b" }} onClick={() => applyPreset("tokkio")} title="NVIDIA Tokkio reference pipeline">▶ TOKKIO BASELINE</button>
            <button style={btn(true)} onClick={testAll}>TEST ALL</button>
          </div>

          <div ref={wrapRef} style={{ position: "relative", overflow: "hidden", minHeight: 0, background: "radial-gradient(circle at 50% 40%, #150d22, #09060f 70%)" }}>
            <div style={{ position: "absolute", top: 8, right: 10, zIndex: 3, display: "flex", gap: 6 }}>
              {SHAPES.map(s => <button key={s[0]} style={{ ...btn(shape === s[0]), padding: "3px 9px" }} onClick={() => setShape(s[0])}>{s[1]} {s[2]}</button>)}
              <button style={{ ...btn(), padding: "3px 9px" }} onClick={() => setZoom(z => Math.max(0.4, +(z - 0.1).toFixed(1)))}>−</button>
              <span style={{ ...lbl, alignSelf: "center" }}>{Math.round(zoom * 100)}%</span>
              <button style={{ ...btn(), padding: "3px 9px" }} onClick={() => setZoom(z => Math.min(2, +(z + 0.1).toFixed(1)))}>+</button>
              <button style={{ ...btn(), padding: "3px 9px" }} onClick={() => setZoom(1)}>Fit</button>
            </div>
            <div style={{ position: "absolute", left: "50%", top: "50%", width: LP.W, height: LP.H, transform: `translate(-50%,-50%) scale(${sc})`, transformOrigin: "center" }}>
              <svg width={LP.W} height={LP.H} style={{ position: "absolute", inset: 0 }}>
                {E.filter(e => byId[e[0]].stage <= stage && byId[e[1]].stage <= stage).map((e, i) => {
                  const [ax, ay] = LP.P[e[0]], [bx, by] = LP.P[e[1]]; const dx = bx - ax, dy = by - ay, horiz = Math.abs(dx) >= Math.abs(dy);
                  const d = horiz ? `M${ax} ${ay} C${ax + dx / 2} ${ay},${ax + dx / 2} ${by},${bx} ${by}` : `M${ax} ${ay} C${ax} ${ay + dy / 2},${bx} ${ay + dy / 2},${bx} ${by}`;
                  const live = ["hot", "client"].includes(health[e[0]]?.state || "") && ["hot", "client"].includes(health[e[1]]?.state || "");
                  const bad = byId[e[0]].stage <= stage && byId[e[1]].stage <= stage && (health[e[0]]?.state === "down" || health[e[1]]?.state === "down");
                  return <g key={i}><path d={d} fill="none" stroke={bad ? RED : GREEN} strokeWidth={bad ? 3.5 : 2.5} style={{ filter: `drop-shadow(0 0 ${bad ? 5 : 3}px ${bad ? RED : GREEN})` }} />
                    <text x={(ax + bx) / 2} y={(ay + by) / 2 - 8} fill={bad ? RED : "#8dffc0"} fontSize={14} textAnchor="middle" fontFamily="monospace">{`${e[2] || "clock"}${modelOf(byId[e[1]]).ms ? ` · ${health[e[1]]?.ms ?? modelOf(byId[e[1]]).ms}ms` : ""}`}</text></g>;
                })}
              </svg>
              {N.map(n => { const [x, y] = LP.P[n.id]; const m = modelOf(n), k = K[n.kind], st = stat(n), on = n.stage <= stage, picked = sel === n.id, down = on && health[n.id]?.state === "down";
                return (
                  <div key={n.id} onClick={() => setSel(n.id)} style={{ position: "absolute", left: x - 100, top: y - 62, width: 200, opacity: on ? 1 : 0.28, cursor: "pointer",
                    border: `2px solid ${down ? RED : picked ? "#f6d775" : k[2] + "88"}`, background: down ? "#2a0a10" : "#120b1d", borderRadius: 12, padding: 12,
                    boxShadow: down ? `0 0 26px ${RED}99, inset 0 0 14px ${RED}33` : picked ? "0 0 22px rgba(246,215,117,.35)" : "none" }}>
                    <div style={{ fontSize: 8, letterSpacing: ".25em", color: "#5d5468", fontFamily: "monospace", marginBottom: 3 }}>CRANE</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 12, fontFamily: "monospace", background: k[1], color: k[2], padding: "1px 7px", borderRadius: 4 }}>{n.tag}</span>
                      <span style={{ flex: 1 }} /><span style={{ fontSize: 11, fontFamily: "monospace", fontWeight: down ? 800 : 400, color: down ? RED : st[1] }}>{st[0]}</span></div>
                    <div style={{ fontWeight: 800, fontSize: 17, marginTop: 5 }}>{m.n}</div>
                    <div style={{ fontSize: 12, color: MUTED, minHeight: 16 }}>{health[n.id]?.note || m.d}</div>
                    <div style={{ fontSize: 11, fontFamily: "monospace", color: "#9a90a8", background: "#0c0614", border: `1px solid ${BORDER}`, borderRadius: 4, padding: "3px 8px", marginTop: 6 }}>
                      {m.port ? `port ${ov(n, "port", m.port)}` : "in-browser"} · {health[n.id]?.ms ?? m.ms}ms</div>
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      <button style={{ ...btn(), padding: "3px 8px", fontSize: 12, flex: 1 }} onClick={ev => { ev.stopPropagation(); swap(n); }}>⇄ Swap</button>
                      <button style={{ ...btn(), padding: "3px 8px", fontSize: 12, flex: 1, color: "#6ee7b7" }} onClick={ev => { ev.stopPropagation(); setSel(n.id); testNode(n).then(setToast); }}>▶ Test</button>
                    </div>
                  </div>); })}
            </div>
          </div>

          {/* bottom panel — triage when red, inspector when clear */}
          <div style={{ borderTop: `2px solid ${openIncs.length ? RED : BORDER}`, background: openIncs.length ? "#110508" : "#0c0813",
            boxShadow: openIncs.length ? `0 -4px 24px ${RED}44` : "none", transition: "all .3s" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 14px", flexWrap: "wrap" }}>
              {openIncs.length > 0 && (
                <button style={{ ...btn(tab === "triage"), borderColor: RED, color: tab === "triage" ? "#fff" : RED, background: tab === "triage" ? RED : "#2a0a10",
                  animation: "pulse-red 1.2s infinite" }} onClick={() => { setTab("triage"); setInspOpen(true); }}>
                  ● TRIAGE {openIncs.length} RED
                </button>)}
              <button style={btn(tab === "inspector")} onClick={() => { setTab("inspector"); setInspOpen(true); }}>NODE INSPECTOR</button>
              <button style={btn(tab === "wiring")} onClick={() => { setTab("wiring"); setInspOpen(true); }}>WIRING SPEC</button>
              <select aria-label="Quick actions" value="" style={{ ...btn(), width: 36, padding: "6px 4px" }} onChange={e => { const v = e.target.value;
                if (v === "beryl" || v === "tokkio") applyPreset(v); else if (v === "reset") { setPick({}); setOver({}); setHealth({}); setToast("Reset to defaults."); } else if (v === "all") testAll(); }}>
                <option value="">▾</option><option value="beryl">Load BERYL preset</option><option value="tokkio">Load TOKKIO baseline</option><option value="all">Test all nodes</option><option value="reset">Reset to defaults</option></select>
              <div style={{ flex: 1 }} />
              {tab === "triage" && <><label style={{ ...lbl, display: "flex", gap: 4, alignItems: "center", cursor: "pointer" }}><input type="checkbox" checked={autoRetry} onChange={e => setAutoRetry(e.target.checked)} />AUTO-RETEST 20s</label>
                <a href="/api/reports/triage/export" download="triage_reports.json" style={{ ...lbl, color: "#76b900" }}>↓ EXPORT</a></>}
              {tab !== "triage" && <><button style={btn()} onClick={() => copy(JSON.stringify(spec, null, 2), "Wiring spec copied to clipboard.")}>⧉ Copy spec</button>
                <button style={btn()} onClick={download}>↓ .json</button></>}
              <button style={{ ...btn(), padding: "6px 10px", fontSize: 13, lineHeight: 1 }} title={inspOpen ? "Collapse panel" : "Expand panel"} onClick={() => setInspOpen(o => !o)}>{inspOpen ? "▾" : "▴"}</button>
            </div>

            {inspOpen && tab === "triage" && (
              <div style={{ padding: "0 14px 14px" }}>
                {incs.length === 0 && <span style={{ fontSize: 11, color: MUTED, padding: "4px 0", display: "block" }}>Watching the pipeline. Each node that goes red gets its own red alert here.</span>}
                <div style={{ display: "flex", gap: 10, overflowX: openIncs.length >= 3 ? "auto" : undefined, scrollSnapType: openIncs.length >= 3 ? "x mandatory" : undefined, paddingBottom: 4 }}>
                  {[...incs].sort((x, y) => (x.end ? 1 : 0) - (y.end ? 1 : 0) || x.start - y.start).map(i => {
                    const n = Math.max(1, Math.min(incs.length, 3)), done = !!i.end, c = done ? OK : RED;
                    return (
                      <div key={i.id} style={{ flex: openIncs.length >= 3 ? "0 0 340px" : `1 1 calc(${100 / n}% - 10px)`, minWidth: 220, scrollSnapAlign: "start",
                        border: `2px solid ${c}`, borderRadius: 10, padding: "10px 12px", background: done ? "#071410" : "#180510",
                        boxShadow: done ? "none" : `0 0 20px ${RED}55, inset 0 0 10px ${RED}22`, display: "grid", gap: 5, alignContent: "start" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <b style={{ color: c, fontSize: 15, letterSpacing: ".12em" }}>
                            {done ? "✓ " : "● "}{i.tag} {done ? "RESOLVED" : "RED ALERT"}
                          </b>
                          <span style={{ fontSize: 9, background: done ? "#0a2010" : "#2a0510", color: c, border: `1px solid ${c}55`, borderRadius: 4, padding: "2px 6px", fontFamily: "monospace" }}>{i.code}</span>
                        </div>
                        <b style={{ fontSize: 30, color: c, letterSpacing: ".06em", fontFamily: "monospace", lineHeight: 1 }}>{fmt((i.end ?? nowT) - i.start)}</b>
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 10, color: MUTED, fontFamily: "monospace" }}>round {i.rounds}</span>
                          {i.resolvedBy && <span style={{ fontSize: 10, background: "#071a04", color: OK, border: `1px solid ${OK}55`, borderRadius: 3, padding: "0 5px" }}>✓ {i.resolvedBy}</span>}
                        </div>
                        <div style={{ maxHeight: 140, overflowY: "auto", display: "grid", gap: 3, borderTop: `1px solid ${c}33`, paddingTop: 5 }}>
                          {[...i.feed].reverse().map((f, k) => (
                            <div key={k} style={{ fontSize: 10.5, lineHeight: 1.35, color: f.who === "LEAD" ? "#ede0b8" : "#c9c0d6" }}>
                              <span style={{ color: MUTED }}>{new Date(f.t).toLocaleTimeString([], { hour12: false })} </span>
                              <b style={{ color: f.who === "LEAD" ? "#f6d775" : "#9a90a8" }}>{f.who}</b> {f.text}
                            </div>))}
                        </div>
                      </div>);
                  })}
                </div>
              </div>)}

            {inspOpen && tab === "wiring" && <pre style={{ margin: 0, padding: "0 14px 12px", fontSize: 11, color: "#c9c0d6", whiteSpace: "pre-wrap", maxHeight: 260, overflowY: "auto" }}>{JSON.stringify(spec, null, 2)}</pre>}

            {inspOpen && tab === "inspector" && (
              <div style={{ display: "grid", gap: 8, padding: "0 14px 12px", maxHeight: 260, overflowY: "auto" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <span style={{ fontSize: 11, fontFamily: "monospace", background: sk[1], color: sk[2], padding: "1px 7px", borderRadius: 4 }}>{sn.tag}</span>
                  <b style={{ fontSize: 17 }}>{sn.role}</b><span style={lbl}>IN {sn.cin} → OUT {sn.cout}</span>
                  <a href={NODE_GUIDE[sn.id][1]} target="_blank" rel="noopener noreferrer" style={{ ...lbl, color: "#b6e35b", marginLeft: "auto" }}>NVIDIA GUIDE: {NODE_GUIDE[sn.id][0]} ↗</a></div>
                <div style={lbl}>MODEL — ONE CLICK SWAP{sn.id === "agt" ? " (any Model Lab source works here)" : ""}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {modelsOf(sn).map(m => <button key={m.n} onClick={() => swap(sn, m.n)} style={{ ...btn(sm.n === m.n), textAlign: "left", padding: "7px 12px" }}>
                    <div>{m.n}</div><div style={{ fontWeight: 400, fontSize: 10, opacity: .75 }}>{m.d}</div></button>)}
                </div>
                {sn.id === "agt" && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={lbl}>ANY MODEL</span>
                    <select style={{ ...inp, width: 150 }} value={custom.pipeline} onChange={e => setCustom(c => ({ ...c, pipeline: e.target.value }))}>
                      {(sources.length ? sources.map(s => s.name) : ["kaggle", "local", "huggingface", "nim", "llamacpp"]).map(s => <option key={s}>{s}</option>)}</select>
                    <input style={{ ...inp, flex: 1, minWidth: 220, width: "auto" }} list="suite-models" placeholder="any hub / Ollama / NIM model id" value={custom.model} onChange={e => setCustom(c => ({ ...c, model: e.target.value }))} />
                    <datalist id="suite-models">{(sources.find(s => s.name === custom.pipeline)?.models || []).map(m => <option key={m} value={m} />)}</datalist>
                    <button style={btn(true)} onClick={addCustom}>USE</button>
                  </div>)}
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1.4fr 1fr", gap: 8 }}>
                  {([["ENDPOINT", "endpoint", endpointOf(sn)], ["PORT", "port", sm.port], ["API KEY ENV VAR (name only)", "key", sm.key], ["LATENCY BUDGET (MS)", "budget", sm.ms * 2 || 50]] as [string, string, string | number][]).map(([l, f, d]) =>
                    <label key={f} style={{ display: "grid", gap: 3 }}><span style={lbl}>{l}</span><input style={inp} value={ov(sn, f, d)} onChange={setF(f)} /></label>)}
                </div>
              </div>)}
          </div>
        </div>

        {/* ── right: live studio — full model view */}
        <aside style={{ borderLeft: `1px solid ${BORDER}`, background: "#0c0813", padding: 14, overflowY: "auto", display: "grid", gap: 10, alignContent: "start" }}>
          <div style={{ display: "flex", alignItems: "center" }}><div><b style={{ letterSpacing: ".1em" }}>BERYL LIVE STUDIO</b><div style={lbl}>Instant Presence · mirror · {ST[stage][0]}</div></div><div style={{ flex: 1 }} />
            <span style={{ fontSize: 11, fontFamily: "monospace", border: `1px solid ${BORDER}`, borderRadius: 999, padding: "3px 10px", color: online ? OK : BAD }}>● Backend {online ? "online" : "offline"}</span></div>
          {/* GPU headroom — compact strip */}
          {gpuUse.length > 0 && <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "6px 10px", display: "grid", gap: 3 }}>
            <span style={lbl}>GPU HEADROOM</span>
            {gpuUse.map(([h, u]) => { const [nm, cap] = GPU_HOST[h] || [h, 0], pct = cap ? u.gb / cap : 0, off = sources.find(x => x.name === h)?.online === false;
              const c = off || pct > 0.95 ? RED : pct > 0.8 ? WARN : GREEN;
              return <div key={h} style={{ fontSize: 11, color: c }}>{nm}: ~{u.gb}/{cap} GB ({Math.round(pct * 100)}%){pct > 0.95 ? " NOT ENOUGH" : pct > 0.8 ? " TIGHT" : " ok"}{off ? " · OFFLINE" : ""}
                <span style={{ color: MUTED }}> {u.names.join(", ")}</span></div>; })}
            {slowIds.map(i => <div key={i} style={{ fontSize: 11, color: WARN }}>SLOW {byIdN(i).tag}: {health[i].ms}ms</div>)}
          </div>}
          <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", border: `1px solid ${BORDER}`, aspectRatio: "1 / 1", background: "#000" }}>
            <img src={portrait} alt="Beryl" style={{ width: "100%", height: "100%", objectFit: "cover", transform: talking ? "scale(1.015)" : "none", transition: "transform .3s" }} />
            <span style={{ position: "absolute", top: 10, left: 10, fontSize: 10, fontFamily: "monospace", background: "rgba(0,0,0,.6)", padding: "2px 8px", borderRadius: 4, color: "#fff" }}><span style={{ color: BAD }}>●</span> {talking ? "SPEAKING" : "LIVE"}</span>
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, textAlign: "center", padding: "26px 0 10px", background: "linear-gradient(transparent,rgba(0,0,0,.8))" }}>
              <div style={{ fontWeight: 800, letterSpacing: ".3em", fontSize: 20 }}>BERYL</div><div style={{ fontSize: 11, color: "#cfc6dc" }}>Beryl Labs · Phase One · {ST[stage][2]}</div></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            <button style={btn(!!recRef.current || talking)} onClick={listen}>● Talk</button>
            <button style={btn()} onClick={() => reply ? say(reply) : speak()}>↑ Speak</button>
            <button style={btn(true)} onClick={() => { const i = active.findIndex(a => a.id === sel); swap(active[(i + 1) % active.length]); }}>⟳ Cycle node</button>
          </div>
          {(heard || reply) && <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 8, fontSize: 12, lineHeight: 1.5 }}>
            {heard && <div><span style={lbl}>YOU </span>{heard}</div>}{reply && <div><span style={{ ...lbl, color: GOLD }}>BERYL </span>{reply}</div>}</div>}
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={lbl}>BLENDSHAPES</span><span style={lbl}>ARKIT 52 · {modelOf(byId.a2f).n.toUpperCase().replace("AUDIO2FACE-3D", "A2F-3D")} (SIM)</span></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 14px" }}>
            {SH.map((s, i) => <div key={s}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: "monospace", color: "#c9c0d6" }}><span>{s}</span><span>{bs[i].toFixed(2)}</span></div>
              <div style={{ height: 3, background: "#241a30", borderRadius: 2 }}><div style={{ height: 3, width: `${Math.min(1, bs[i]) * 100}%`, background: "#7c6cf0", borderRadius: 2 }} /></div></div>)}
          </div>
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 10, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
            <div><div style={lbl}>DRIFT</div><b style={{ color: Math.abs(clk.drift) < 50 ? OK : WARN }}>{clk.drift.toFixed(1)}ms</b></div>
            <div><div style={lbl}>SKEW</div><b style={{ color: Math.abs(clk.skew) < 20 ? OK : WARN }}>{clk.skew >= 0 ? "+" : ""}{clk.skew.toFixed(1)}ms</b></div>
            <div><div style={lbl}>E2E BUDGET</div><b style={{ color: e2e <= 900 ? OK : WARN }}>{e2e}ms</b></div>
            <div><div style={lbl}>STAGE</div><b>{ST[stage][0]}</b></div>
          </div>
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 10, fontSize: 11, color: "#c9c0d6", lineHeight: 1.5 }}>
            <div style={lbl}>STATUS</div>{toast}
            <div style={{ ...lbl, marginTop: 8 }}>STAGE CONTRACTS</div><b>Control plane</b> &lt;1s always<br /><b>Data plane</b> warms cold<br />
            <span style={{ color: MUTED }}>E2E {e2e}ms vs Tokkio {TOKKIO_BUDGET_MS}ms. Budgets are targets; TEST shows measured numbers.</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
