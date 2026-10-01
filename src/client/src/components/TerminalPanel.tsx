import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { wsUrl } from "../hooks/useSocket";

type Target = "local" | "gcp" | "nvidia";

const TABS: { id: Target; label: string; color: string; title: string }[] = [
  { id: "local",  label: "LOCAL",  color: "#3ecf8e", title: "Ubuntu bash in project directory" },
  { id: "gcp",    label: "GCP",    color: "#60a5fa", title: "SSH into berylize-node (GPU)" },
  { id: "nvidia", label: "NVIDIA", color: "#76b900", title: "Local shell with NIM / NGC env loaded" },
];

function TermInstance({ project, target }: { project: string; target: Target }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const colors: Record<Target, string> = {
      local:  "#f5b301",
      gcp:    "#60a5fa",
      nvidia: "#76b900",
    };
    const term = new Terminal({
      fontFamily: "JetBrains Mono, ui-monospace, monospace",
      fontSize: 12, cursorBlink: true,
      theme: { background: "#0d0f12", foreground: "#e6e6e6", cursor: colors[target] },
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
    return () => { ro.disconnect(); ws.close(); term.dispose(); };
  }, [project, target]);
  return <div className="term-host" ref={host} />;
}

export default function TerminalPanel({ project }: { project: string }) {
  const [target, setTarget] = useState<Target>("local");
  // Key forces remount (new shell) when tab changes
  const [key, setKey] = useState(0);

  const switchTarget = (t: Target) => { setTarget(t); setKey(k => k + 1); };

  const tab = TABS.find(t => t.id === target)!;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* tab bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 0, background: "#0b0d10", borderBottom: "1px solid #242a33", flex: "none" }}>
        {TABS.map(t => (
          <button key={t.id} title={t.title} onClick={() => switchTarget(t.id)} style={{
            background: "none", border: 0, borderBottom: target === t.id ? `2px solid ${t.color}` : "2px solid transparent",
            padding: "5px 14px", cursor: "pointer", fontSize: 10, fontWeight: 800, letterSpacing: "0.1em",
            color: target === t.id ? t.color : "#4a5260", fontFamily: "var(--sans)",
          }}>
            {t.id === "gcp" && (
              <svg style={{ marginRight: 4, verticalAlign: "middle" }} width="9" height="9" viewBox="0 0 24 24" fill={target === "gcp" ? t.color : "#4a5260"}>
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
              </svg>
            )}
            {t.label}
          </button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 9, color: "#3a4350", padding: "0 10px", fontFamily: "monospace" }}>
          {tab.title}
        </span>
      </div>
      {/* terminal instance — remounts on tab switch to get a fresh shell */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <TermInstance key={`${project}-${target}-${key}`} project={project} target={target} />
      </div>
    </div>
  );
}
