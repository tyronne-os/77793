/**
 * CRANE Backend Panel — React Flow canvas showing the 3 AI service nodes:
 *   Qwen 2.5-Coder 32B (bottom center, gold — the orchestrating brain)
 *   MiniMax H3        (top right, purple — diffusion image/video)
 *   Kokoro TTS        (top left, blue — voice cloning & synthesis)
 *
 * Edges use the same animated-pulse-dot style as Big Proppa's LakeCanvas:
 * dashed #cdaaba stroke, orange #f08a3a dot traveling back and forth via SMIL.
 * Canvas background uses the Big Proppa radial glow (orange + purple) over
 * the deep #120818 canvas bg.
 */
import {
  Background,
  BaseEdge,
  getBezierPath,
  Handle,
  Position,
  ReactFlow,
  type EdgeProps,
  type NodeProps,
} from "reactflow";
import "reactflow/dist/style.css";

// ── palette (exact Big Proppa tokens) ────────────────────────────────────────
const BP = {
  canvasBg:    "#120818",
  cardBg:      "#140a20",
  border:      "#2a1e36",
  fg:          "#ece6f2",
  muted:       "#8a8290",
  gold1:       "#f1dc92",
  gold2:       "#d9b45a",
  gold3:       "#c9a54e",
  gold4:       "#8a6224",
  gold5:       "#6b4a1c",
  orange:      "#e0782f",
  orangeBr:    "#f08a3a",
  edgeStroke:  "#cdaaba",
  purple1:     "#a084d8",
  purple2:     "#7c3aed",
  purple3:     "#3a1e60",
  blue1:       "#60a5fa",
  blue2:       "#2563eb",
  blue3:       "#1e3a5f",
};

// ── animated pulse edge ───────────────────────────────────────────────────────
function PulseEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, label }: EdgeProps) {
  const [edgePath, lx, ly] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const pathId = `pp-${id}`;
  const glowId = `pg-${id}`;

  return (
    <>
      <defs>
        <path id={pathId} d={edgePath} fill="none" stroke="none" />
        <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={{
        stroke: BP.edgeStroke, strokeWidth: 1.4, strokeDasharray: "4 4", opacity: 0.75, ...style
      }} />
      <circle r={4.5} fill={BP.orangeBr} filter={`url(#${glowId})`}>
        <animateMotion dur="3s" repeatCount="indefinite" calcMode="linear" keyPoints="0;1;0" keyTimes="0;0.5;1">
          <mpath href={`#${pathId}`} />
        </animateMotion>
      </circle>
      {/* edge label pill */}
      <foreignObject x={lx - 30} y={ly - 11} width={60} height={22} style={{ overflow: "visible" }}>
        <div style={{
          fontFamily: "monospace", fontSize: 9, fontWeight: 600, color: BP.fg,
          background: BP.cardBg, border: `1px solid ${BP.border}`, borderRadius: 999,
          padding: "2px 8px", whiteSpace: "nowrap", textAlign: "center",
        }}>
          {String(label ?? "→")}
        </div>
      </foreignObject>
    </>
  );
}

// ── node types ────────────────────────────────────────────────────────────────
type NodeData = { label: string; sub: string; tag: string; chip: string; frame: string; tagBg: string; tagFg: string };

function AiNode({ data }: NodeProps<NodeData>) {
  return (
    <div style={{
      width: 210, padding: "6px 7px 8px", borderRadius: 10,
      border: `1.5px solid ${BP.gold3}`,
      background: data.frame,
      boxShadow: `0 0 0 1px #3a2610, 0 14px 34px rgba(0,0,0,0.55)`,
    }}>
      <Handle type="target"   position={Position.Top}    style={{ background: BP.orange, border: `1.5px solid ${BP.gold5}` }} />
      <Handle type="source"   position={Position.Bottom} style={{ background: BP.orange, border: `1.5px solid ${BP.gold5}` }} />
      {/* top bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
        <span style={{ fontSize: 7, fontWeight: 800, letterSpacing: "0.32em", color: "rgba(255,255,255,0.85)" }}>
          CRANE
        </span>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: BP.orange, boxShadow: `0 0 6px ${BP.orangeBr}` }} />
      </div>
      {/* inner screen */}
      <div style={{
        background: "#07050d", border: `1px solid ${BP.border}`, borderRadius: 6,
        padding: "8px 9px 6px", boxShadow: "inset 0 0 12px rgba(0,0,0,0.8)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{
            fontFamily: "monospace", fontSize: 8, fontWeight: 700,
            color: data.tagFg, background: data.tagBg, borderRadius: 3, padding: "2px 5px",
          }}>{data.tag}</span>
          <span style={{ fontFamily: "monospace", fontSize: 8, color: BP.muted }}>ACTIVE</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: BP.fg }}>{data.label}</span>
        </div>
        <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", color: BP.muted, marginTop: 3 }}>
          {data.sub}
        </div>
        <div style={{ height: 1, background: BP.orange, opacity: 0.6, margin: "6px 0" }} />
        <span style={{
          fontFamily: "monospace", fontSize: 9, color: BP.gold2,
          background: "#1a1520", border: `1px solid ${BP.border}`,
          borderRadius: 999, padding: "2px 8px", display: "inline-block",
        }}>{data.chip}</span>
      </div>
    </div>
  );
}

// ── graph data ────────────────────────────────────────────────────────────────
const NODES = [
  {
    id: "qwen",
    type: "ai",
    position: { x: 220, y: 340 },
    data: {
      label: "Qwen 32B",
      sub: "2.5-Coder · abliterated",
      tag: "LLM",
      chip: "port 8010 · vLLM",
      frame: `linear-gradient(160deg,${BP.gold1},${BP.gold4} 55%,${BP.gold5})`,
      tagBg: BP.orangeBr,
      tagFg: "#1a0a00",
    },
  },
  {
    id: "minimax",
    type: "ai",
    position: { x: 400, y: 60 },
    data: {
      label: "MiniMax H3",
      sub: "Diffusion · image & video",
      tag: "DIFFUSION",
      chip: "port 8011 · OpenAI compat",
      frame: `linear-gradient(160deg,${BP.purple1},${BP.purple2} 55%,${BP.purple3})`,
      tagBg: BP.purple1,
      tagFg: "#0a0018",
    },
  },
  {
    id: "kokoro",
    type: "ai",
    position: { x: 30, y: 60 },
    data: {
      label: "Kokoro TTS",
      sub: "82M · voice cloning & synth",
      tag: "VOICE",
      chip: "port 8012 · local",
      frame: `linear-gradient(160deg,${BP.blue1},${BP.blue2} 55%,${BP.blue3})`,
      tagBg: BP.blue1,
      tagFg: "#060e1a",
    },
  },
];

const EDGES = [
  {
    id: "qwen-minimax",
    source: "qwen",
    target: "minimax",
    type: "pulse",
    label: "diffuse",
    sourceHandle: null,
    targetHandle: null,
  },
  {
    id: "qwen-kokoro",
    source: "qwen",
    target: "kokoro",
    type: "pulse",
    label: "speak",
    sourceHandle: null,
    targetHandle: null,
  },
];

const NODE_TYPES = { ai: AiNode };
const EDGE_TYPES = { pulse: PulseEdge };

// ── panel component ───────────────────────────────────────────────────────────
export default function BackendPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <div className="bp-overlay">
      <div className="bp-overlay-header">
        <span className="bp-overlay-title">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 7 }}>
            <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
          </svg>
          CRANE BACKEND
        </span>
        <span style={{ fontSize: 11, color: BP.muted, marginLeft: 10 }}>3 AI nodes · all edges live</span>
        <button className="bp-overlay-close" onClick={onClose}>×</button>
      </div>
      <div style={{
        flex: 1,
        background: `radial-gradient(ellipse 70% 55% at 28% 30%, rgba(125,52,18,0.38), transparent 70%),
                     radial-gradient(ellipse 80% 60% at 70% 78%, rgba(112,40,150,0.38), transparent 70%),
                     ${BP.canvasBg}`,
      }}>
        <ReactFlow
          nodes={NODES}
          edges={EDGES}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background color={BP.border} gap={24} />
        </ReactFlow>
      </div>
    </div>
  );
}
