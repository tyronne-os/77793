import { useEffect, useRef, useState } from "react";

export const wsUrl = (path: string) =>
  `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${path}`;

/** JSON WebSocket that reconnects. `onMessage` may change between renders. */
export function useSocket(path: string, onMessage: (m: any) => void) {
  const ref = useRef<WebSocket | null>(null);
  const handler = useRef(onMessage);
  handler.current = onMessage;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true, timer: number;
    const connect = () => {
      const ws = new WebSocket(wsUrl(path));
      ref.current = ws;
      ws.onopen = () => setOpen(true);
      ws.onmessage = (e) => { try { handler.current(JSON.parse(e.data)); } catch { /* ignore */ } };
      ws.onclose = () => { setOpen(false); if (alive) timer = window.setTimeout(connect, 1500); };
    };
    connect();
    return () => { alive = false; clearTimeout(timer); ref.current?.close(); };
  }, [path]);

  const send = (m: unknown) => ref.current?.readyState === 1 && (ref.current.send(JSON.stringify(m)), true);
  return { send, open };
}
