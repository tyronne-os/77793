/**
 * CRANE Backend Panel — React Flow canvas + Hermes dock + voice test
 *
 * 5 improvements over the original static canvas:
 *   1. Live health dots  — polls /api/services/status every 5s (ports 8010/8011/8012)
 *   2. Per-node actions  — Tunnel / NIM / ZeroGPU / Start Kokoro buttons on each card
 *   3. Hermes dock       — hermes desktop, hermes chat, Full Stack one-click launcher
 *   4. Voice test widget — type text → Kokoro TTS → plays audio in the browser
 *   5. GPU quick-controls — berylize-node status/cost, Start/Pause without opening the meter
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Background, BaseEdge, getBezierPath,
  Handle, Position, ReactFlow,
  type EdgeProps, type NodeProps,
} from "reactflow";
import "reactflow/dist/style.css";

// ── Big Proppa palette ────────────────────────────────────────────────────────
const BP = {
  canvasBg:   "#120818", cardBg: "#140a20", border: "#2a1e36",
  fg: "#ece6f2", muted: "#8a8290",
  gold1: "#f1dc92", gold2: "#d9b45a", gold3: "#c9a54e", gold4: "#8a6224", gold5: "#6b4a1c",
  orange: "#e0782f", orangeBr: "#f08a3a", edgeStroke: "#cdaaba",
  purple1: "#a084d8", purple2: "#7c3aed", purple3: "#3a1e60",
  blue1: "#60a5fa", blue2: "#2563eb", blue3: "#1e3a5f",
  ok: "#3ecf8e", bad: "#ff5d5d", warn: "#f5b301",
};

// ── module-level action dispatcher (stable ref for node buttons) ──────────────
let _dispatch: ((nodeId: string, action: string) => void) | null = null;

// ── animated pulse edge (same SMIL as Big Proppa) ────────────────────────────
function PulseEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, label }: EdgeProps) {
  const [edgePath, lx, ly] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const pathId = `pp-${id}`, glowId = `pg-${id}`;
  return (
    <>
      <defs>
        <path id={pathId} d={edgePath} fill="none" stroke="none" />
        <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <BaseEdge id={id} path={edgePath} style={{ stroke: BP.edgeStroke, strokeWidth: 1.4, strokeDasharray: "4 4", opacity: 0.75 }} />
      <circle r={4.5} fill={BP.orangeBr} filter={`url(#${glowId})`}>
        <animateMotion dur="3s" repeatCount="indefinite" calcMode="linear" keyPoints="0;1;0" keyTimes="0;0.5;1">
          <mpath href={`#${pathId}`} />
        </animateMotion>
      </circle>
      <foreignObject x={lx - 32} y={ly - 11} width={64} height={22} style={{ overflow: "visible" }}>
        <div style={{ fontFamily: "monospace", fontSize: 9, fontWeight: 600, color: BP.fg, background: BP.cardBg, border: `1px solid ${BP.border}`, borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap", textAlign: "center" }}>
          {String(label ?? "→")}
        </div>
      </foreignObject>
    </>
  );
}

// ── node types ────────────────────────────────────────────────────────────────
type NodeData = {
  nodeId: string; label: string; sub: string; tag: string; chip: string;
  frame: string; tagBg: string; tagFg: string; online: boolean | null;
  actions: { label: string; key: string; variant: "ok" | "warn" | "muted" }[];
};

function AiNode({ data }: NodeProps<NodeData>) {
  const statusColor = data.online === null ? BP.warn : data.online ? BP.ok : BP.bad;
  const statusLabel = data.online === null ? "CHECKING…" : data.online ? "ONLINE" : "OFFLINE";
  return (
    <div style={{ width: 210, padding: "6px 7px 8px", borderRadius: 10, border: `1.5px solid ${BP.gold3}`, background: data.frame, boxShadow: `0 0 0 1px #3a2610, 0 14px 34px rgba(0,0,0,0.55)` }}>
      <Handle type="target" position={Position.Top} style={{ background: BP.orange, border: `1.5px solid ${BP.gold5}` }} />
      <Handle type="source" position={Position.Bottom} style={{ background: BP.orange, border: `1.5px solid ${BP.gold5}` }} />
      <Handle id="kb-in" type="target" position={Position.Right} style={{ background: BP.ok, border: `1.5px solid ${BP.gold5}` }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
        <span style={{ fontSize: 7, fontWeight: 800, letterSpacing: "0.32em", color: "rgba(255,255,255,0.85)" }}>CRANE</span>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor, boxShadow: data.online ? `0 0 6px ${statusColor}` : "none", transition: "background .4s" }} />
      </div>
      <div style={{ background: "#07050d", border: `1px solid ${BP.border}`, borderRadius: 6, padding: "8px 9px 6px", boxShadow: "inset 0 0 12px rgba(0,0,0,0.8)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: "monospace", fontSize: 8, fontWeight: 700, color: data.tagFg, background: data.tagBg, borderRadius: 3, padding: "2px 5px" }}>{data.tag}</span>
          <span style={{ fontFamily: "monospace", fontSize: 8, color: statusColor, letterSpacing: "0.08em" }}>{statusLabel}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: BP.fg }}>{data.label}</span>
        </div>
        <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", color: BP.muted, marginTop: 3 }}>{data.sub}</div>
        <div style={{ height: 1, background: BP.orange, opacity: 0.6, margin: "6px 0" }} />
        <span style={{ fontFamily: "monospace", fontSize: 9, color: data.online ? BP.ok : BP.muted, background: "#1a1520", border: `1px solid ${BP.border}`, borderRadius: 999, padding: "2px 8px", display: "inline-block" }}>{data.chip}</span>
        {/* action buttons */}
        {data.actions.length > 0 && (
          <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
            {data.actions.map(a => {
              const bg = a.variant === "ok" ? "#0d1f17" : a.variant === "warn" ? "#2a1e06" : "#1a1520";
              const fg = a.variant === "ok" ? BP.ok : a.variant === "warn" ? BP.gold2 : BP.muted;
              const hoverBg = a.variant === "ok" ? BP.ok : a.variant === "warn" ? BP.gold2 : "#2a2e3a";
              return (
                <button key={a.key}
                  onMouseEnter={e => { (e.target as HTMLButtonElement).style.background = hoverBg; (e.target as HTMLButtonElement).style.color = "#000"; }}
                  onMouseLeave={e => { (e.target as HTMLButtonElement).style.background = bg; (e.target as HTMLButtonElement).style.color = fg; }}
                  onClick={e => { e.stopPropagation(); _dispatch?.(data.nodeId, a.key); }}
                  style={{ background: bg, border: `1px solid ${fg}22`, borderRadius: 5, padding: "3px 7px", cursor: "pointer", fontFamily: "var(--sans)", fontSize: 9, fontWeight: 700, color: fg, letterSpacing: "0.08em", whiteSpace: "nowrap", transition: "background .15s,color .15s" }}>
                  {a.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}


// ── Second Brain node (Obsidian vault → Berylize) ─────────────────────────────
type KbData = {
  stats: { notes: number; chunks: number; links: number; enabled: boolean; kinds: Record<string, number>; vault?: string } | null;
  hits: { note: string; heading: string; score: number }[]; flash: boolean;
};
const KB_GREEN = "#3ecf8e";

function KbNode({ data }: NodeProps<KbData>) {
  const s = data.stats;
  const on = !!s?.enabled && (s?.notes ?? 0) > 0;
  const col = s === null ? BP.warn : on ? KB_GREEN : BP.bad;
  const btn = (label: string, key: string, c: string) => (
    <button key={key} onClick={e => { e.stopPropagation(); _dispatch?.("brain", key); }}
      style={{ background: "#0d1f17", border: `1px solid ${c}33`, borderRadius: 5, padding: "3px 7px", cursor: "pointer", fontFamily: "var(--sans)", fontSize: 9, fontWeight: 700, color: c, letterSpacing: "0.08em" }}>{label}</button>
  );
  return (
    <div style={{ width: 250, padding: "6px 7px 8px", borderRadius: 10, border: `1.5px solid ${data.flash ? KB_GREEN : "#2f7a5a"}`, background: "linear-gradient(160deg,#1e5a43,#123a2b 55%,#0b2a1e)", boxShadow: data.flash ? `0 0 0 2px ${KB_GREEN}66, 0 0 28px ${KB_GREEN}55` : "0 0 0 1px #0a2a1c, 0 14px 34px rgba(0,0,0,0.55)", transition: "box-shadow .35s, border-color .35s" }}>
      <Handle type="source" position={Position.Left} style={{ background: KB_GREEN, border: `1.5px solid ${BP.gold5}` }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
        <span style={{ fontSize: 7, fontWeight: 800, letterSpacing: "0.32em", color: "rgba(255,255,255,0.85)" }}>CRANE</span>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: col, boxShadow: on ? `0 0 6px ${col}` : "none" }} />
      </div>
      <div style={{ background: "#07050d", border: `1px solid ${BP.border}`, borderRadius: 6, padding: "8px 9px 6px", boxShadow: "inset 0 0 12px rgba(0,0,0,0.8)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: "monospace", fontSize: 8, fontWeight: 700, color: "#04140d", background: KB_GREEN, borderRadius: 3, padding: "2px 5px" }}>SECOND BRAIN</span>
          <span style={{ fontFamily: "monospace", fontSize: 8, color: col, letterSpacing: "0.08em" }}>{s === null ? "CHECKING…" : on ? "INDEXED" : s.enabled ? "EMPTY" : "PAUSED"}</span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: BP.fg, marginTop: 8 }}>Avatar Knowledge Vault</div>
        <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", color: BP.muted, marginTop: 3 }}>OBSIDIAN GRAPH · SECONDARY TO BERYLIZE</div>
        <div style={{ height: 1, background: KB_GREEN, opacity: 0.5, margin: "6px 0" }} />
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {[["notes", s?.notes], ["chunks", s?.chunks], ["links", s?.links]].map(([k, v]) => (
            <span key={k as string} style={{ fontFamily: "monospace", fontSize: 9, color: on ? KB_GREEN : BP.muted, background: "#1a1520", border: `1px solid ${BP.border}`, borderRadius: 999, padding: "2px 8px" }}>{v ?? "–"} {k}</span>
          ))}
        </div>
        <div style={{ marginTop: 7, fontFamily: "monospace", fontSize: 9, color: BP.muted, minHeight: 24, lineHeight: 1.35 }}>
          {data.hits.length
            ? <><span style={{ color: KB_GREEN }}>last recall ▸ </span>{data.hits.slice(0, 3).map(h => h.note.length > 24 ? h.note.slice(0, 23) + "…" : h.note).join(" · ")}</>
            : "no recall yet — asks about avatars pull from here"}
        </div>
        <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
          {btn("↻ Reindex", "reindex", KB_GREEN)}
          {btn(s?.enabled === false ? "▶ Enable" : "⏸ Pause", "toggle", BP.gold2)}
        </div>
      </div>
    </div>
  );
}

const NODE_TYPES = { ai: AiNode, kb: KbNode };
const EDGE_TYPES = { pulse: PulseEdge };

// ── static graph definition ───────────────────────────────────────────────────
const BASE_NODES = [
  { id: "qwen",    position: { x: 220, y: 340 }, frame: `linear-gradient(160deg,${BP.gold1},${BP.gold4} 55%,${BP.gold5})`,    tag: "LLM",       tagBg: BP.orangeBr, tagFg: "#1a0a00", label: "Berylize",    sub: "BASE QWEN · LOCAL MODEL", chip: "port 8010 · vLLM",          actions: [{ label: "Tunnel", key: "tunnel", variant: "ok" as const }, { label: "NIM →", key: "nim", variant: "warn" as const }] },
  { id: "minimax", position: { x: 400, y: 60 },  frame: `linear-gradient(160deg,${BP.purple1},${BP.purple2} 55%,${BP.purple3})`, tag: "DIFFUSION", tagBg: BP.purple1,  tagFg: "#0a0018", label: "Berylize Creatives",  sub: "MiniMax H3 · image & video", chip: "port 8011 · OpenAI compat", actions: [{ label: "Tunnel", key: "tunnel", variant: "ok" as const }, { label: "ZeroGPU", key: "zerogpu", variant: "warn" as const }] },
  { id: "kokoro",  position: { x: 30, y: 60 },   frame: `linear-gradient(160deg,${BP.blue1},${BP.blue2} 55%,${BP.blue3})`,     tag: "VOICE",     tagBg: BP.blue1,    tagFg: "#060e1a", label: "Kokoro TTS", sub: "82M · voice cloning & synth", chip: "port 8012 · local",         actions: [{ label: "▶ Start", key: "start", variant: "ok" as const }, { label: "♪ Test", key: "test", variant: "muted" as const }] },
];

const EDGES = [
  { id: "qwen-minimax", source: "qwen", target: "minimax", type: "pulse", label: "diffuse" },
  { id: "qwen-kokoro",  source: "qwen", target: "kokoro",  type: "pulse", label: "speak" },
  { id: "brain-qwen",   source: "brain", target: "qwen", targetHandle: "kb-in", type: "pulse", label: "recall" },
];

const PORT_MAP: Record<string, number> = { qwen: 8010, minimax: 8011, kokoro: 8012 };

// ── panel component ───────────────────────────────────────────────────────────
type SvcStatus = Record<string, boolean | null>;
type GpuMetrics = { running: boolean; cost: number; uptime: number; util?: number } | null;

export default function BackendPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [svc, setSvc] = useState<SvcStatus>({ qwen: null, minimax: null, kokoro: null });
  const [gpu, setGpu] = useState<GpuMetrics>(null);
  const [hermesMsg, setHermesMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [voiceText, setVoiceText] = useState("");
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [gpuWorking, setGpuWorking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [kb, setKb] = useState<KbData["stats"]>(null);
  const [kbHits, setKbHits] = useState<KbData["hits"]>([]);
  const [kbFlash, setKbFlash] = useState(false);
  const [modelName, setModelName] = useState("Berylize");
  const kbRef = useRef<KbData["stats"]>(null);
  kbRef.current = kb;

  // poll service status + GPU every 5s
  useEffect(() => {
    if (!open) return;
    const poll = async () => {
      const [s, g] = await Promise.all([
        fetch("/api/services/status").then(r => r.json()).catch(() => ({})),
        fetch("/api/gpu/status").then(r => r.json()).catch(() => null),
      ]);
      setSvc(s);
      fetch("/api/knowledge/status").then(r => r.json()).then(k => { setKb(k); if (k.last_hits?.length) setKbHits(h => h.length ? h : k.last_hits); }).catch(() => setKb(null));
      fetch("/api/status").then(r => r.json()).then(st => st?.name && setModelName(st.name)).catch(() => {});
      if (g) setGpu({ running: g.running ?? false, cost: g.total_cost_usd ?? 0, uptime: g.uptime_seconds ?? 0, util: g.gpu_util });
    };
    poll();
    const t = setInterval(poll, 5000);
    return () => clearInterval(t);
  }, [open]);

  // light up the Second Brain node whenever chat retrieved notes
  useEffect(() => {
    const onKb = (e: Event) => {
      const hits = ((e as CustomEvent).detail ?? []) as KbData["hits"];
      setKbHits(hits);
      if (hits.length) { setKbFlash(true); setTimeout(() => setKbFlash(false), 1800); }
    };
    window.addEventListener("crane-kb", onKb);
    return () => window.removeEventListener("crane-kb", onKb);
  }, []);

  // action dispatcher for node buttons
  _dispatch = useCallback((nodeId: string, action: string) => {
    const port = PORT_MAP[nodeId];
    const tunnelCmds: Record<string, string> = {
      qwen:    `gcloud compute ssh berylize-node --project=posh-eden --zone=us-east1-c -- -N -L 8010:localhost:8000 -f`,
      minimax: `gcloud compute ssh berylize-node --project=posh-eden --zone=us-east1-c -- -N -L 8011:localhost:8001 -f`,
    };
    const exec = (cmd: string) => {
      window.dispatchEvent(new CustomEvent("crane-open-terminal"));
      setTimeout(() => window.dispatchEvent(new CustomEvent("crane-terminal-exec", { detail: { cmd } })), 150);
    };
    switch (`${nodeId}.${action}`) {
      case "brain.reindex": fetch("/api/knowledge/reindex", { method: "POST" }).then(r => r.json()).then(setKb).catch(() => {}); break;
      case "brain.toggle":  fetch("/api/knowledge/toggle", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: !(kbRef.current?.enabled ?? true) }) })
                              .then(() => fetch("/api/knowledge/status")).then(r => r.json()).then(setKb).catch(() => {}); break;
      case "qwen.tunnel":    exec(tunnelCmds.qwen); break;
      case "minimax.tunnel": exec(tunnelCmds.minimax); break;
      case "qwen.nim":       exec(`export NVIDIA_API_KEY=$NGC_API_KEY && echo "NIM mode — using integrate.api.nvidia.com"`); break;
      case "minimax.zerogpu": window.open(`https://huggingface.co/spaces`, "_blank"); break;
      case "kokoro.start":   exec(`python3 -m kokoro_onnx serve --port 8012 --device cpu 2>/dev/null || echo "Try: pip install kokoro-onnx && kokoro-onnx serve --port 8012"`); break;
      case "kokoro.test":    setVoiceText(t => t || "Hello, I am CRANE's voice agent. How can I help you today?"); break;
    }
  }, []);

  // build live nodes (inject online status)
  const liveNodes: any[] = BASE_NODES.map(n => ({
    id: n.id, type: "ai", position: n.position,
    data: { nodeId: n.id, label: n.id === "qwen" ? modelName : n.label, sub: n.sub, tag: n.tag, chip: n.chip, frame: n.frame, tagBg: n.tagBg, tagFg: n.tagFg, online: svc[n.id] ?? null, actions: n.actions },
  }));

  liveNodes.push({ id: "brain", type: "kb", position: { x: 500, y: 340 }, data: { stats: kb, hits: kbHits, flash: kbFlash } });

  const launchHermes = async (mode: string) => {
    setHermesMsg(null);
    const r = await fetch("/api/services/hermes", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode }),
    }).then(r => r.json()).catch(() => ({ ok: false, message: "Request failed" }));
    setHermesMsg({ ok: r.ok, text: r.message ?? (r.ok ? `hermes ${mode} launched (pid ${r.pid})` : "launch failed") });
  };

  const speakText = async () => {
    const t = voiceText.trim();
    if (!t) return;
    setVoiceLoading(true); setVoiceError(null); setAudioSrc(null);
    const r = await fetch("/api/services/kokoro/tts", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: t }),
    }).then(r => r.json()).catch(() => ({ ok: false, message: "Request failed" }));
    setVoiceLoading(false);
    if (r.ok) {
      const src = `data:${r.content_type || "audio/wav"};base64,${r.audio_b64}`;
      setAudioSrc(src);
      setTimeout(() => audioRef.current?.play().catch(() => {}), 50);
    } else {
      setVoiceError(r.message ?? "Kokoro TTS error");
    }
  };

  const gpuAction = async (action: "start" | "pause") => {
    setGpuWorking(true);
    await fetch(`/api/gpu/${action}`, { method: "POST" }).catch(() => {});
    setGpuWorking(false);
    const g = await fetch("/api/gpu/status").then(r => r.json()).catch(() => null);
    if (g) setGpu({ running: g.running ?? false, cost: g.total_cost_usd ?? 0, uptime: g.uptime_seconds ?? 0, util: g.gpu_util });
  };

  if (!open) return null;

  const uptimeStr = gpu ? (() => {
    const s = gpu.uptime; if (!s) return "—";
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h ? `${h}h ${m}m` : `${m}m`;
  })() : "—";

  return (
    <div className="bp-overlay">
      {/* header */}
      <div className="bp-overlay-header">
        <span className="bp-overlay-title">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 7 }}>
            <circle cx="5" cy="12" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="19" cy="19" r="2"/>
            <line x1="7" y1="11.5" x2="17" y2="6"/><line x1="7" y1="12.5" x2="17" y2="18"/>
          </svg>
          CRANE BACKEND
        </span>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginLeft: 14, flex: 1 }}>
          {(["qwen", "minimax", "kokoro"] as const).map(k => (
            <span key={k} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: BP.muted }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: svc[k] === null ? BP.warn : svc[k] ? BP.ok : BP.bad, boxShadow: svc[k] ? `0 0 5px ${BP.ok}` : "none" }} />
              {k}
            </span>
          ))}
        </div>
        <button className="bp-overlay-close" onClick={onClose}>×</button>
      </div>

      {/* React Flow canvas */}
      <div style={{ flex: 1, minHeight: 0, background: `radial-gradient(ellipse 70% 55% at 28% 30%,rgba(125,52,18,.38),transparent 70%), radial-gradient(ellipse 80% 60% at 70% 78%,rgba(112,40,150,.38),transparent 70%), ${BP.canvasBg}` }}>
        <ReactFlow
          nodes={liveNodes} edges={EDGES}
          nodeTypes={NODE_TYPES} edgeTypes={EDGE_TYPES}
          fitView fitViewOptions={{ padding: 0.3 }}
          proOptions={{ hideAttribution: true }}
          nodesDraggable={false} nodesConnectable={false}
        >
          <Background color={BP.border} gap={24} />
        </ReactFlow>
      </div>

      {/* Hermes + GPU + Voice dock */}
      <div className="bp-dock">
        {/* row 1: Hermes launcher */}
        <div className="bp-dock-row">
          <span className="bp-dock-label">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={BP.gold2} strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
            HERMES
          </span>
          <button className="bp-action-btn ok" onClick={() => launchHermes("desktop")} title="Open Hermes desktop UI">🖥 desktop</button>
          <button className="bp-action-btn warn" onClick={() => launchHermes("chat")} title="Start Hermes chat mode">💬 chat</button>
          <button className="bp-action-btn gold" onClick={() => launchHermes("full")} title="Full stack: GPU + tunnels + Hermes desktop">⚡ Full Stack</button>
          {hermesMsg && (
            <span className={`bp-dock-msg ${hermesMsg.ok ? "ok" : "bad"}`}>{hermesMsg.text}</span>
          )}
        </div>

        {/* row 2: GPU quick-controls */}
        <div className="bp-dock-row">
          <span className="bp-dock-label">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={gpu?.running ? BP.ok : BP.muted} strokeWidth="2" strokeLinecap="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 6V4M10 6V4M14 6V4M18 6V4"/></svg>
            GPU
          </span>
          <span style={{ fontSize: 10, color: gpu?.running ? BP.ok : BP.bad, fontFamily: "monospace", letterSpacing: "0.06em" }}>
            {gpu === null ? "…" : gpu.running ? "RUNNING" : "STOPPED"}
          </span>
          {gpu?.running && <span style={{ fontSize: 10, color: BP.muted, fontFamily: "monospace" }}>{uptimeStr}</span>}
          {gpu?.running && gpu.util !== undefined && <span style={{ fontSize: 10, color: BP.gold2, fontFamily: "monospace" }}>{gpu.util}% util</span>}
          {gpu?.running && <span style={{ fontSize: 10, color: BP.warn, fontFamily: "monospace" }}>${gpu.cost.toFixed(2)}</span>}
          <button className="bp-action-btn ok" disabled={gpuWorking || !!gpu?.running} onClick={() => gpuAction("start")}>▶ Start</button>
          <button className="bp-action-btn bad" disabled={gpuWorking || !gpu?.running} onClick={() => gpuAction("pause")}>⏸ Pause</button>
        </div>

        {/* row 3: Voice test */}
        <div className="bp-dock-row bp-dock-voice">
          <span className="bp-dock-label">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={BP.blue1} strokeWidth="2" strokeLinecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
            VOICE TEST
          </span>
          <input
            className="bp-voice-input"
            placeholder={svc.kokoro ? "Type text → Kokoro TTS speaks it…" : "Start Kokoro (port 8012) first…"}
            value={voiceText} onChange={e => setVoiceText(e.target.value)}
            onKeyDown={e => e.key === "Enter" && speakText()}
          />
          <button className="bp-action-btn ok" disabled={voiceLoading || !voiceText.trim()} onClick={speakText}>
            {voiceLoading ? "…" : "🔊 Speak"}
          </button>
          {audioSrc && (
            <audio ref={audioRef} src={audioSrc} controls style={{ height: 28, filter: "invert(0.8) sepia(0.5)" }} />
          )}
          {voiceError && <span className="bp-dock-msg bad">{voiceError}</span>}
        </div>
      </div>
    </div>
  );
}
