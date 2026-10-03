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
    { n: "Mirror Loop", d: "L0 idle · always live", port: 8020, proto: "WebRTC", acc: "CPU", ms: 80, key: "" },
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
  const [tab, setTab] = useState<"inspector" | "wiring">("inspector");
  const [health, setHealth] = useState<Record<string, Health>>({});
  const [sources, setSources] = useState<Source[]>([]);
  const [online, setOnline] = useState(false);
  const [toast, setToast] = useState("Select a node, swap its model, TEST it, copy the wiring spec.");
  const [talking, setTalking] = useState(false);
  const [bs, setBs] = useState<number[]>(SH.map(() => 0));
  const [wrap, setWrap] = useState({ w: 600, h: 400 });
  const [custom, setCustom] = useState({ pipeline: "huggingface", model: "" });
  const [extra, setExtra] = useState<Model[]>([]);
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

  // ---- layout + animation
  useEffect(() => {
    if (!open || !wrapRef.current) return;
    const el = wrapRef.current; const fit = () => setWrap({ w: el.clientWidth, h: el.clientHeight });
    fit(); const ro = new ResizeObserver(fit); ro.observe(el); return () => ro.disconnect();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setBs(SH.map(n => { const t2 = talkRef.current;
      return n === "jawOpen" || n.startsWith("mouth") ? (t2 ? Math.random() * .8 : Math.random() * .03) : n.startsWith("eyeBlink") ? (Math.random() > .93 ? .9 : .03) : Math.random() * (t2 ? .25 : .03); })), 140);
    return () => clearInterval(t);
  }, [open]);

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
  const copy = (txt: string, msg: string) => { try { navigator.clipboard.writeText(txt); } catch { /* clipboard blocked */ } setToast(msg); };
  const download = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(spec, null, 2)], { type: "application/json" })); a.download = "beryl.pipeline.json"; a.click(); };
  const speak = () => { try { const u = new SpeechSynthesisUtterance("Hi, I'm Beryl. This is the live studio."); u.onstart = () => setTalking(true); u.onend = () => setTalking(false); speechSynthesis.cancel(); speechSynthesis.speak(u); } catch { setTalking(t => !t); } };

  if (!open) return null;
  const LP = layout(shape);
  const fitK = Math.max(0.15, Math.min(1.1, Math.min((wrap.w - 4) / LP.W, (wrap.h - 4) / LP.H))), sc = fitK * zoom;
  const byId = Object.fromEntries(N.map(n => [n.id, n]));
  const stat = (n: NodeDef): [string, string] => { if (n.stage > stage) return ["COLD", "#6b6478"]; const h = health[n.id]?.state;
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
        <span style={{ fontSize: 11, fontFamily: "monospace", color: online ? OK : BAD }}>● Backend {online ? "online" : "offline"} · localhost</span>
        <button style={btn(true)} onClick={onClose}>Close</button>
      </header>

      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "minmax(0,1fr) 360px" }}>
        {/* ── left: graph + inspector */}
        <div style={{ display: "grid", gridTemplateRows: "auto minmax(0,1fr) auto", minHeight: 0, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", flexWrap: "wrap" }}>
            <div><div style={{ fontWeight: 800, color: FG, fontSize: 13 }}>PIPELINE</div><div style={lbl}>{N.filter(n => n.stage <= stage).length} nodes · {ST[stage][0]} stage · {hotCount} up</div></div>
            {ST.map((s, i) => <button key={s[0]} style={btn(stage === i)} onClick={() => setStage(i)}>{s[0]} {s[1]}</button>)}
            <div style={{ flex: 1 }} />
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
                  return <g key={i}><path d={d} fill="none" stroke={live ? "#10b981" : "#3a2e46"} strokeWidth={2} strokeDasharray={live ? "6 6" : "3 6"} />
                    {e[2] && <text x={(ax + bx) / 2} y={(ay + by) / 2 - 8} fill="#9a90a8" fontSize={14} textAnchor="middle" fontFamily="monospace">{e[2]}</text>}</g>;
                })}
              </svg>
              {N.map(n => { const [x, y] = LP.P[n.id]; const m = modelOf(n), k = K[n.kind], st = stat(n), on = n.stage <= stage, picked = sel === n.id;
                return (
                  <div key={n.id} onClick={() => setSel(n.id)} style={{ position: "absolute", left: x - 100, top: y - 62, width: 200, opacity: on ? 1 : 0.28, cursor: "pointer", background: "#120b1d",
                    border: `2px solid ${picked ? "#f6d775" : k[2] + "88"}`, borderRadius: 12, padding: 12, boxShadow: picked ? "0 0 22px rgba(246,215,117,.35)" : "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 12, fontFamily: "monospace", background: k[1], color: k[2], padding: "1px 7px", borderRadius: 4 }}>{n.tag}</span>
                      <span style={{ flex: 1 }} /><span style={{ fontSize: 11, fontFamily: "monospace", color: st[1] }}>{st[0]}</span></div>
                    <div style={{ fontWeight: 800, fontSize: 17, marginTop: 5 }}>{m.n}</div>
                    <div style={{ fontSize: 12, color: MUTED, minHeight: 16 }}>{health[n.id]?.note || m.d}</div>
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      <button style={{ ...btn(), padding: "3px 8px", fontSize: 12, flex: 1 }} onClick={ev => { ev.stopPropagation(); swap(n); }}>⇄ Swap</button>
                      <button style={{ ...btn(), padding: "3px 8px", fontSize: 12, flex: 1, color: "#6ee7b7" }} onClick={ev => { ev.stopPropagation(); setSel(n.id); testNode(n).then(setToast); }}>▶ Test</button>
                    </div>
                  </div>); })}
            </div>
          </div>

          {/* inspector */}
          <div style={{ borderTop: `1px solid ${BORDER}`, background: "#0c0813", padding: "10px 14px", maxHeight: 290, overflowY: "auto" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
              <button style={btn(tab === "inspector")} onClick={() => setTab("inspector")}>NODE INSPECTOR</button>
              <button style={btn(tab === "wiring")} onClick={() => setTab("wiring")}>WIRING SPEC</button>
              <div style={{ flex: 1 }} />
              <button style={btn()} onClick={() => copy(JSON.stringify(spec, null, 2), "Wiring spec copied to clipboard.")}>⧉ Copy spec</button>
              <button style={btn()} onClick={download}>↓ .json</button>
            </div>
            {tab === "wiring" ? <pre style={{ margin: 0, fontSize: 11, color: "#c9c0d6", whiteSpace: "pre-wrap" }}>{JSON.stringify(spec, null, 2)}</pre> : (
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <span style={{ fontSize: 11, fontFamily: "monospace", background: sk[1], color: sk[2], padding: "1px 7px", borderRadius: 4 }}>{sn.tag}</span>
                  <b style={{ fontSize: 17 }}>{sn.role}</b><span style={lbl}>IN {sn.cin} → OUT {sn.cout}</span></div>
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

        {/* ── right: live studio */}
        <aside style={{ borderLeft: `1px solid ${BORDER}`, background: "#0c0813", padding: 14, overflowY: "auto", display: "grid", gap: 10, alignContent: "start" }}>
          <div style={{ display: "flex", alignItems: "center" }}><div><b style={{ letterSpacing: ".1em" }}>BERYL LIVE STUDIO</b><div style={lbl}>{ST[stage][2]} · mirror · {ST[stage][0]}</div></div></div>
          <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", border: `1px solid ${BORDER}`, aspectRatio: "1 / 1", background: "#000" }}>
            <img src={portrait} alt="Beryl" style={{ width: "100%", height: "100%", objectFit: "cover", transform: talking ? "scale(1.015)" : "none", transition: "transform .3s" }} />
            <span style={{ position: "absolute", top: 10, left: 10, fontSize: 10, fontFamily: "monospace", background: "rgba(0,0,0,.6)", padding: "2px 8px", borderRadius: 4, color: "#fff" }}><span style={{ color: BAD }}>●</span> {talking ? "SPEAKING" : "LIVE"}</span>
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, textAlign: "center", padding: "26px 0 10px", background: "linear-gradient(transparent,rgba(0,0,0,.8))" }}>
              <div style={{ fontWeight: 800, letterSpacing: ".3em", fontSize: 20 }}>BERYL</div><div style={{ fontSize: 11, color: "#cfc6dc" }}>Beryl Labs · Phase One · {ST[stage][2]}</div></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            <button style={btn(talking)} onClick={() => setTalking(t => !t)}>● Talk</button>
            <button style={btn()} onClick={speak}>↑ Speak</button>
            <button style={btn(true)} onClick={() => { const i = active.findIndex(a => a.id === sel); swap(active[(i + 1) % active.length]); }}>⟳ Cycle node</button>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={lbl}>BLENDSHAPES</span><span style={lbl}>ARKIT 52 · DEMO SIGNAL</span></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 14px" }}>
            {SH.map((s, i) => <div key={s}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: "monospace", color: "#c9c0d6" }}><span>{s}</span><span>{bs[i].toFixed(2)}</span></div>
              <div style={{ height: 3, background: "#241a30", borderRadius: 2 }}><div style={{ height: 3, width: `${Math.min(1, bs[i]) * 100}%`, background: "#7c6cf0", borderRadius: 2 }} /></div></div>)}
          </div>
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 10, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            <div><div style={lbl}>E2E BUDGET</div><b style={{ color: e2e <= 900 ? OK : WARN }}>{e2e}ms</b></div>
            <div><div style={lbl}>TOKKIO REF</div><b>{TOKKIO_BUDGET_MS}ms</b></div>
            <div><div style={lbl}>STAGE</div><b>{ST[stage][0]}</b></div>
          </div>
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 10, fontSize: 11, color: "#c9c0d6", lineHeight: 1.5 }}>
            <div style={lbl}>STATUS</div>{toast}
            <div style={{ ...lbl, marginTop: 8 }}>STAGE CONTRACTS</div>Control plane &lt;1s always · Data plane warms cold.<br />
            Budgets are published per-model targets; TEST shows measured numbers.
          </div>
        </aside>
      </div>
    </div>
  );
}
