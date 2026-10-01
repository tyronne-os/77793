import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { wsUrl } from "../hooks/useSocket";

/** Shell in the project folder. Re-mounts (new shell) when the project changes. */
export default function TerminalPanel({ project }: { project: string }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const term = new Terminal({ fontFamily: "JetBrains Mono, ui-monospace, monospace", fontSize: 12, cursorBlink: true,
      theme: { background: "#0d0f12", foreground: "#e6e6e6", cursor: "#f5b301" } });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host.current!);
    const ws = new WebSocket(wsUrl("/ws/terminal"));
    ws.binaryType = "arraybuffer";
    const enc = new TextEncoder();
    const resize = () => { fit.fit(); if (ws.readyState === 1) ws.send(JSON.stringify({ type: "resize", rows: term.rows, cols: term.cols })); };
    ws.onopen = resize;
    ws.onmessage = (e) => term.write(typeof e.data === "string" ? e.data : new Uint8Array(e.data));
    ws.onclose = () => term.write("\r\n\x1b[33m[shell closed]\x1b[0m\r\n");
    term.onData((d) => ws.readyState === 1 && ws.send(enc.encode(d)));
    const ro = new ResizeObserver(resize);
    ro.observe(host.current!);
    return () => { ro.disconnect(); ws.close(); term.dispose(); };
  }, [project]);
  return <div className="term-host" ref={host} />;
}
