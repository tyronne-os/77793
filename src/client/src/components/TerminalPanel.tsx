import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { wsUrl } from "../hooks/useSocket";

type Target = "local" | "gcp" | "nvidia";

const TABS: { id: Target; label: string; color: string; title: string }[] = [
  { id: "local",  label: "LOCAL",  color: "#d9b45a", title: "Ubuntu bash in project directory" },
  { id: "gcp",    label: "GCP",    color: "#60a5fa", title: "SSH into berylize-node (GPU)" },
  { id: "nvidia", label: "NVIDIA", color: "#76b900", title: "Local shell with NIM / NGC env loaded" },
];

const BP = {
  bg:     "#0b0512",
  panel:  "#120818",
  panel2: "#140a20",
  line:   "#2a1e36",
  mute:   "#4a3e58",
  text:   "#cdaaba",
};

function TermInstance({ project, target, execListen }: { project: string; target: Target; execListen: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const colors: Record<Target, string> = {
      local:  "#d9b45a",
      gcp:    "#60a5fa",
      nvidia: "#76b900",
    };
    const term = new Terminal({
      fontFamily: "JetBrains Mono, ui-monospace, monospace",
      fontSize: 12, cursorBlink: true,
      theme: { background: "#080410", foreground: "#cdaaba", cursor: colors[target], cursorAccent: "#0b0512" },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host.current!);
    const url = wsUrl(`/ws/terminal?target=${target}`);
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    const enc = new TextEncoder();
    const resize = () => {
      fit.fit();
      if (ws.readyState === 1) ws.send(JSON.stringify({ type: "resize", rows: term.rows, cols: term.cols }));
    };
    ws.onopen = resize;
    ws.onmessage = (e) => term.write(typeof e.data === "string" ? e.data : new Uint8Array(e.data));
    ws.onclose = () => term.write(`\r\n\x1b[33m[${target} shell closed]\x1b[0m\r\n`);
    term.onData((d) => ws.readyState === 1 && ws.send(enc.encode(d)));
    const ro = new ResizeObserver(resize);
    ro.observe(host.current!);
    // execute commands sent from chat code-block Run buttons (only primary pane listens)
    let execHandler: ((ev: Event) => void) | null = null;
    if (execListen) {
      execHandler = (ev: Event) => {
        const cmd = (ev as CustomEvent).detail?.cmd as string;
        if (cmd && ws.readyState === 1) ws.send(enc.encode(cmd + "\n"));
      };
      window.addEventListener("crane-terminal-exec", execHandler);
    }
    return () => {
      if (execHandler) window.removeEventListener("crane-terminal-exec", execHandler);
      ro.disconnect(); ws.close(); term.dispose();
    };
  }, [project, target, execListen]);
  return <div className="term-host" ref={host} style={{ height: "100%" }} />;
}

export default function TerminalPanel({ project, onClose }: { project: string; onClose?: () => void }) {
  const [target, setTarget] = useState<Target>("local");
  const [key, setKey] = useState(0);
  const [split, setSplit] = useState(false);

  const switchTarget = (t: Target) => { setTarget(t); setKey(k => k + 1); };

  const tab = TABS.find(t => t.id === target)!;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: BP.bg }}>
      {/* tab bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 0, background: BP.panel, borderBottom: `1px solid ${BP.line}`, flex: "none" }}>
        {/* target tabs */}
        {TABS.map(t => (
          <button key={t.id} title={t.title} onClick={() => switchTarget(t.id)} style={{
            background: "none", border: 0,
            borderBottom: target === t.id ? `2px solid ${t.color}` : "2px solid transparent",
            padding: "6px 14px", cursor: "pointer", fontSize: 10, fontWeight: 800, letterSpacing: "0.1em",
            color: target === t.id ? t.color : BP.mute, fontFamily: "var(--sans)",
            transition: "color .12s",
          }}>
            {t.id === "gcp" && (
              <svg style={{ marginRight: 4, verticalAlign: "middle" }} width="9" height="9" viewBox="0 0 24 24" fill={target === "gcp" ? t.color : BP.mute}>
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
              </svg>
            )}
            {t.label}
          </button>
        ))}

        {/* divider */}
        <div style={{ width: 1, height: 20, background: BP.line, margin: "0 4px" }} />

        {/* action buttons: Split and Close */}
        <button
          title={split ? "Remove split" : "Split terminal"}
          onClick={() => setSplit(s => !s)}
          style={{
            background: split ? "#261a0e" : "none", border: 0,
            borderBottom: split ? `2px solid #d9b45a` : "2px solid transparent",
            padding: "6px 12px", cursor: "pointer", fontSize: 10, fontWeight: 800, letterSpacing: "0.1em",
            color: split ? "#d9b45a" : BP.mute, fontFamily: "var(--sans)", display: "flex", alignItems: "center", gap: 4,
          }}>
          {/* split icon */}
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="1" y="1" width="10" height="10" rx="1"/>
            <line x1="6" y1="1" x2="6" y2="11"/>
          </svg>
          SPLIT
        </button>

        <button
          title="Close terminal"
          onClick={onClose}
          style={{
            background: "none", border: 0, borderBottom: "2px solid transparent",
            padding: "6px 10px", cursor: "pointer", fontSize: 10, fontWeight: 800, letterSpacing: "0.1em",
            color: BP.mute, fontFamily: "var(--sans)", display: "flex", alignItems: "center", gap: 4,
          }}
          onMouseEnter={e => (e.currentTarget.style.color = "#ff5d5d")}
          onMouseLeave={e => (e.currentTarget.style.color = BP.mute)}>
          {/* close icon */}
          <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="1" y1="1" x2="11" y2="11"/><line x1="11" y1="1" x2="1" y2="11"/>
          </svg>
          CLOSE
        </button>

        {/* right: hint */}
        <span style={{ marginLeft: "auto", fontSize: 9, color: BP.mute, padding: "0 10px", fontFamily: "monospace", opacity: .7 }}>
          {tab.title}
        </span>
      </div>

      {/* terminal pane(s) */}
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <TermInstance key={`${project}-${target}-${key}`} project={project} target={target} execListen={true} />
        </div>
        {split && (
          <>
            <div style={{ width: 1, background: BP.line, flex: "none" }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <TermInstance key={`${project}-${target}-${key}-split`} project={project} target={target} execListen={false} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
