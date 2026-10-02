/**
 * CRANE Podman Panel — 10 advanced features
 * Accessible from the header PODMAN button or by asking Qwen in chat.
 */
import { useCallback, useEffect, useState } from "react";

const PM = {
  bg:      "#0b0512",
  panel:   "#120818",
  panel2:  "#140a20",
  line:    "#2a1e36",
  mute:    "#4a3e58",
  text:    "#cdaaba",
  gold:    "#d9b45a",
  ok:      "#3ecf8e",
  bad:     "#ff5d5d",
  warn:    "#f08a3a",
};

type Tab = "containers" | "images" | "pods" | "volumes" | "networks" | "run" | "convert" | "stats" | "workstation";

type Container = { id: string; name: string; image: string; status: string; state: string; ports: string };
type Image     = { id: string; name: string; size: number; created: string };
type Pod       = { id: string; name: string; status: string; containers: number };
type Volume    = { name: string; driver: string; mountpoint: string };
type Network   = { id: string; name: string; driver: string; subnets: string };
type Stat      = { id: string; name: string; cpu_pct: string; mem_usage: string; mem_pct: string; net_io: string; pids: number };

function Dot({ ok }: { ok: boolean | null }) {
  const color = ok === null ? PM.mute : ok ? PM.ok : PM.bad;
  return <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />;
}

function Btn({ label, style: s, onClick, disabled, title }: { label: string; style?: "ok" | "bad" | "gold" | "warn" | "mute"; onClick: () => void; disabled?: boolean; title?: string }) {
  const colors: Record<string, { bg: string; border: string; color: string }> = {
    ok:   { bg: "#0d1f17", border: "#1a4035", color: PM.ok },
    bad:  { bg: "#1f0d0d", border: "#3a1515", color: PM.bad },
    gold: { bg: "#2a1e06", border: "#6b4a1c", color: PM.gold },
    warn: { bg: "#1f1308", border: "#4a2a10", color: PM.warn },
    mute: { bg: "#140a20", border: "#2a1e36", color: PM.mute },
  };
  const c = colors[s ?? "mute"];
  return (
    <button title={title} disabled={disabled} onClick={onClick} style={{
      border: `1px solid ${disabled ? PM.line : c.border}`,
      background: c.bg, color: disabled ? PM.mute : c.color,
      borderRadius: 6, padding: "4px 10px", cursor: disabled ? "default" : "pointer",
      font: `700 10px/1 var(--sans)`, letterSpacing: ".06em", whiteSpace: "nowrap", opacity: disabled ? .5 : 1,
    }}>{label}</button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ font: `700 9px/1 var(--sans)`, letterSpacing: ".14em", color: PM.mute, textTransform: "uppercase" as const }}>{title}</div>
      {children}
    </div>
  );
}

function LogModal({ logs, onClose }: { logs: string; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 600, background: "#00000090", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}>
      <div style={{ background: PM.panel2, border: `1px solid ${PM.line}`, borderRadius: 12, width: "min(860px,92vw)", maxHeight: "70vh", display: "flex", flexDirection: "column", overflow: "hidden" }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", padding: "10px 14px", borderBottom: `1px solid ${PM.line}` }}>
          <span style={{ font: `700 11px/1 var(--sans)`, color: PM.gold }}>CONTAINER LOGS</span>
          <button onClick={onClose} style={{ marginLeft: "auto", background: "none", border: 0, color: PM.mute, cursor: "pointer", fontSize: 20 }}>×</button>
        </div>
        <pre style={{ flex: 1, overflow: "auto", margin: 0, padding: "12px 14px", font: "12px/1.5 var(--mono)", color: PM.text, background: "#080410" }}>{logs || "(no output)"}</pre>
      </div>
    </div>
  );
}

export default function PodmanPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("containers");
  const [engine, setEngine] = useState<{ available: boolean; engine: string | null; version: string | null } | null>(null);

  // data
  const [containers, setContainers] = useState<Container[]>([]);
  const [images, setImages]         = useState<Image[]>([]);
  const [pods, setPods]             = useState<Pod[]>([]);
  const [volumes, setVolumes]       = useState<Volume[]>([]);
  const [networks, setNetworks]     = useState<Network[]>([]);
  const [stats, setStats]           = useState<Stat[]>([]);

  // UI state
  const [loading, setLoading]     = useState(false);
  const [logs, setLogs]           = useState<string | null>(null);
  const [msg, setMsg]             = useState<{ text: string; ok: boolean } | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  // run form
  const [runImage, setRunImage]   = useState("");
  const [runName, setRunName]     = useState("");
  const [runPorts, setRunPorts]   = useState("");
  const [runEnv, setRunEnv]       = useState("");
  const [runVols, setRunVols]     = useState("");
  const [runCmd, setRunCmd]       = useState("");
  const [runDetach, setRunDetach] = useState(true);
  const [runOutput, setRunOutput] = useState("");

  // convert
  const [convertResult, setConvertResult] = useState<{ ok: boolean; changes: { file: string; action: string }[]; suggestions: string[]; message: string } | null>(null);

  // workstation
  type WsService = { label: string; port: number; url: string; profile: string; state: string; running: boolean };
  const [wsServices, setWsServices] = useState<Record<string, WsService>>({});
  const [wsModels, setWsModels] = useState<{ name: string; id: string; size: string }[]>([]);
  const [wsLoading, setWsLoading] = useState(false);
  const [wsPullModel, setWsPullModel] = useState("phi3:mini");
  const [wsOutput, setWsOutput] = useState("");
  const [wsBusy, setWsBusy] = useState<string | null>(null);

  const loadWorkstation = useCallback(async () => {
    setWsLoading(true);
    try {
      const s = await fetch("/api/workstation/status").then(r => r.json());
      if (s.ok) setWsServices(s.services ?? {});
      const m = await fetch("/api/workstation/models").then(r => r.json());
      if (m.ok) setWsModels(m.models ?? []);
    } catch { /* swallow */ }
    setWsLoading(false);
  }, []);

  const wsAction = async (profile: string) => {
    setWsBusy(profile); setWsOutput("");
    try {
      const r = await fetch("/api/workstation/start", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ profile }),
      }).then(r => r.json());
      setWsOutput(r.output || (r.ok ? "Started" : r.message || "Error"));
      await loadWorkstation();
    } catch (e) { setWsOutput(String(e)); }
    setWsBusy(null);
  };

  const wsStop = async () => {
    setWsBusy("stop"); setWsOutput("");
    try {
      const r = await fetch("/api/workstation/stop", { method: "POST" }).then(r => r.json());
      setWsOutput(r.output || "Stopped");
      await loadWorkstation();
    } catch (e) { setWsOutput(String(e)); }
    setWsBusy(null);
  };

  const wsPull = async () => {
    if (!wsPullModel.trim()) return;
    setWsBusy("pull"); setWsOutput(`Pulling ${wsPullModel}...`);
    try {
      const r = await fetch("/api/workstation/pull", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: wsPullModel }),
      }).then(r => r.json());
      setWsOutput(r.output || (r.ok ? `✓ ${wsPullModel} ready` : r.message || "Error"));
      await loadWorkstation();
    } catch (e) { setWsOutput(String(e)); }
    setWsBusy(null);
  };

  const wsBuildLab = async () => {
    setWsBusy("build"); setWsOutput("Building crane-lab image (~5min)...");
    try {
      const r = await fetch("/api/workstation/build", { method: "POST" }).then(r => r.json());
      setWsOutput(r.output || (r.ok ? "Build complete" : r.message || "Error"));
    } catch (e) { setWsOutput(String(e)); }
    setWsBusy(null);
  };

  useEffect(() => {
    if (open && tab === "workstation") loadWorkstation();
  }, [open, tab, loadWorkstation]);

  // pull
  const [pullImage, setPullImage] = useState("");
  const [pullOutput, setPullOutput] = useState("");

  // systemd
  const [systemdUnit, setSystemdUnit] = useState<{ name: string; unit: string } | null>(null);

  const flash = (text: string, ok = true) => { setMsg({ text, ok }); setTimeout(() => setMsg(null), 4000); };

  const load = useCallback(async (t: Tab) => {
    setLoading(true);
    try {
      if (t === "containers") {
        const d = await fetch("/api/podman/containers?all=true").then(r => r.json());
        setContainers(d.containers ?? []);
      } else if (t === "images") {
        const d = await fetch("/api/podman/images").then(r => r.json());
        setImages(d.images ?? []);
      } else if (t === "pods") {
        const d = await fetch("/api/podman/pods").then(r => r.json());
        setPods(d.pods ?? []);
      } else if (t === "volumes") {
        const d = await fetch("/api/podman/volumes").then(r => r.json());
        setVolumes(d.volumes ?? []);
      } else if (t === "networks") {
        const d = await fetch("/api/podman/networks").then(r => r.json());
        setNetworks(d.networks ?? []);
      } else if (t === "stats") {
        const d = await fetch("/api/podman/containers/stats").then(r => r.json());
        setStats(d.stats ?? []);
      }
    } catch { /* swallow */ }
    setLoading(false);
  }, []);

  // load engine status once
  useEffect(() => {
    if (!open) return;
    fetch("/api/podman/status").then(r => r.json()).then(setEngine).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (open) load(tab);
  }, [open, tab, load]);

  const action = async (url: string, method = "POST", body?: unknown) => {
    setActionBusy(url);
    try {
      const r = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      }).then(r => r.json());
      if (r.ok === false) flash(r.message || "Error", false);
      else flash(r.message || "Done");
      await load(tab);
      return r;
    } catch (e) {
      flash(String(e), false);
    } finally {
      setActionBusy(null);
    }
  };

  if (!open) return null;

  const TABS: { id: Tab; label: string }[] = [
    { id: "workstation", label: "⚡ WORKSTATION" },
    { id: "containers",  label: "CONTAINERS"     },
    { id: "images",      label: "IMAGES"         },
    { id: "pods",        label: "PODS"           },
    { id: "volumes",     label: "VOLUMES"        },
    { id: "networks",    label: "NETWORKS"       },
    { id: "stats",       label: "STATS"          },
    { id: "run",         label: "RUN"            },
    { id: "convert",     label: "CONVERT"        },
  ];

  const stateColor = (state: string) => {
    const s = (state || "").toLowerCase();
    if (s.includes("run")) return PM.ok;
    if (s.includes("exit") || s.includes("stop") || s.includes("dead")) return PM.bad;
    return PM.warn;
  };

  const fmtBytes = (b: number) => {
    if (!b) return "—";
    if (b > 1e9) return (b / 1e9).toFixed(1) + " GB";
    if (b > 1e6) return (b / 1e6).toFixed(1) + " MB";
    return (b / 1e3).toFixed(0) + " KB";
  };

  return (
    <>
      {logs !== null && <LogModal logs={logs} onClose={() => setLogs(null)} />}
      {systemdUnit && (
        <div style={{ position: "fixed", inset: 0, zIndex: 600, background: "#00000090", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setSystemdUnit(null)}>
          <div style={{ background: PM.panel2, border: `1px solid ${PM.line}`, borderRadius: 12, width: "min(800px,92vw)", maxHeight: "70vh", display: "flex", flexDirection: "column", overflow: "hidden" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", padding: "10px 14px", borderBottom: `1px solid ${PM.line}` }}>
              <span style={{ font: `700 11px/1 var(--sans)`, color: PM.gold }}>SYSTEMD UNIT — {systemdUnit.name}</span>
              <Btn label="Copy" style="gold" onClick={() => navigator.clipboard.writeText(systemdUnit.unit)} />
              <button onClick={() => setSystemdUnit(null)} style={{ marginLeft: 8, background: "none", border: 0, color: PM.mute, cursor: "pointer", fontSize: 20 }}>×</button>
            </div>
            <pre style={{ flex: 1, overflow: "auto", margin: 0, padding: "12px 14px", font: "12px/1.5 var(--mono)", color: PM.text }}>{systemdUnit.unit}</pre>
          </div>
        </div>
      )}

      <div style={{ position: "fixed", inset: 0, zIndex: 300, background: PM.bg, display: "flex", flexDirection: "column" }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 18px", height: 48, background: PM.panel2, borderBottom: `1px solid ${PM.line}`, flexShrink: 0 }}>
          {/* podman logo-ish */}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={PM.gold} strokeWidth="1.8">
            <rect x="2" y="8" width="20" height="12" rx="2"/>
            <path d="M6 8V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v3"/>
            <line x1="12" y1="12" x2="12" y2="16"/>
            <line x1="8" y1="14" x2="16" y2="14"/>
          </svg>
          <span style={{ font: `800 12px/1 var(--sans)`, letterSpacing: ".12em", color: PM.gold }}>PODMAN</span>
          {engine && (
            <span style={{ font: `11px var(--mono)`, color: engine.available ? PM.ok : PM.bad, marginLeft: 4 }}>
              {engine.available ? `${engine.engine} ${engine.version ?? ""}` : "not installed"}
            </span>
          )}
          {!engine?.available && (
            <span style={{ font: `10px var(--sans)`, color: PM.mute, marginLeft: 4 }}>
              — install: <code style={{ color: PM.gold }}>sudo apt install podman</code>
            </span>
          )}
          {msg && (
            <span style={{ marginLeft: 12, font: `11px var(--mono)`, color: msg.ok ? PM.ok : PM.bad, padding: "3px 8px", background: msg.ok ? "#0d1f17" : "#1f0d0d", borderRadius: 5, border: `1px solid ${msg.ok ? "#1a4035" : "#3a1515"}` }}>
              {msg.text}
            </span>
          )}
          <button onClick={() => load(tab)} style={{ marginLeft: "auto", background: "none", border: `1px solid ${PM.line}`, borderRadius: 6, padding: "4px 10px", color: PM.mute, cursor: "pointer", font: `700 10px/1 var(--sans)` }}>↺ Refresh</button>
          <button onClick={onClose} style={{ marginLeft: 8, background: "none", border: 0, color: PM.mute, cursor: "pointer", fontSize: 22, lineHeight: 1, padding: 0 }}>×</button>
        </div>

        {/* tabs */}
        <div style={{ display: "flex", background: PM.panel, borderBottom: `1px solid ${PM.line}`, flexShrink: 0, overflowX: "auto" as const }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              background: "none", border: 0, borderBottom: tab === t.id ? `2px solid ${PM.gold}` : "2px solid transparent",
              padding: "8px 16px", cursor: "pointer", font: `700 10px/1 var(--sans)`, letterSpacing: ".1em",
              color: tab === t.id ? PM.gold : PM.mute, whiteSpace: "nowrap" as const,
            }}>{t.label}</button>
          ))}
        </div>

        {/* body */}
        <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
          {loading && <div style={{ color: PM.mute, font: "12px var(--sans)", textAlign: "center", padding: 32 }}>Loading…</div>}

          {/* CONTAINERS */}
          {!loading && tab === "containers" && (
            <Section title={`Containers (${containers.length})`}>
              {containers.length === 0 && <div style={{ color: PM.mute, fontSize: 12, textAlign: "center", padding: 24 }}>No containers found</div>}
              {containers.map(c => (
                <div key={c.id} style={{ background: PM.panel2, border: `1px solid ${PM.line}`, borderRadius: 10, padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Dot ok={c.state === "running"} />
                    <span style={{ font: `600 12px/1 var(--mono)`, color: PM.text }}>{c.name}</span>
                    <span style={{ font: `10px var(--mono)`, color: PM.mute }}>{c.id}</span>
                    <span style={{ font: `10px var(--sans)`, color: stateColor(c.state), marginLeft: 4 }}>{c.state}</span>
                    {c.ports && <span style={{ font: `9px var(--mono)`, color: PM.mute, marginLeft: "auto" }}>{c.ports}</span>}
                  </div>
                  <div style={{ font: `11px var(--mono)`, color: PM.mute }}>{c.image}</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const, marginTop: 2 }}>
                    <Btn label="▶ Start"   style="ok"   disabled={!!actionBusy} onClick={() => action(`/api/podman/containers/${c.id}/start`)} />
                    <Btn label="■ Stop"    style="warn" disabled={!!actionBusy} onClick={() => action(`/api/podman/containers/${c.id}/stop`)} />
                    <Btn label="↺ Restart" style="mute" disabled={!!actionBusy} onClick={() => action(`/api/podman/containers/${c.id}/restart`)} />
                    <Btn label="📋 Logs"   style="mute" disabled={!!actionBusy} onClick={async () => {
                      const r = await fetch(`/api/podman/containers/${c.id}/logs?tail=200`).then(r => r.json());
                      setLogs(r.logs ?? "");
                    }} />
                    <Btn label="⚙ Systemd" style="gold" disabled={!!actionBusy} onClick={async () => {
                      const r = await fetch(`/api/podman/containers/${c.id}/systemd`, { method: "POST" }).then(r => r.json());
                      if (r.ok) setSystemdUnit({ name: r.name, unit: r.unit });
                      else flash(r.message, false);
                    }} />
                    <Btn label="✕ Remove"  style="bad"  disabled={!!actionBusy} onClick={() => { if (confirm(`Remove container ${c.name}?`)) action(`/api/podman/containers/${c.id}/remove`); }} />
                  </div>
                </div>
              ))}
            </Section>
          )}

          {/* IMAGES */}
          {!loading && tab === "images" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Section title="Pull Image">
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={pullImage} onChange={e => setPullImage(e.target.value)}
                    placeholder="e.g. nginx:latest or ghcr.io/org/image:tag"
                    onKeyDown={e => e.key === "Enter" && pullImage && action("/api/podman/images/pull", "POST", { image: pullImage }).then(r => r && setPullOutput(r.output ?? ""))}
                    style={{ flex: 1, background: "#0d0a14", border: `1px solid ${PM.line}`, borderRadius: 6, padding: "6px 10px", font: "12px var(--mono)", color: PM.text, outline: "none" }} />
                  <Btn label="Pull" style="gold" disabled={!pullImage || !!actionBusy}
                    onClick={() => action("/api/podman/images/pull", "POST", { image: pullImage }).then(r => r && setPullOutput(r.output ?? ""))} />
                </div>
                {pullOutput && <pre style={{ font: "11px/1.4 var(--mono)", color: PM.mute, margin: 0, maxHeight: 120, overflow: "auto", background: "#080410", borderRadius: 6, padding: "6px 10px" }}>{pullOutput}</pre>}
              </Section>
              <Section title={`Local Images (${images.length})`}>
                {images.length === 0 && <div style={{ color: PM.mute, fontSize: 12, textAlign: "center", padding: 16 }}>No images</div>}
                {images.map(img => (
                  <div key={img.id} style={{ background: PM.panel2, border: `1px solid ${PM.line}`, borderRadius: 10, padding: "9px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ font: `600 12px var(--mono)`, color: PM.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{img.name}</span>
                    <span style={{ font: `10px var(--mono)`, color: PM.mute, flexShrink: 0 }}>{img.id}</span>
                    <span style={{ font: `10px var(--mono)`, color: PM.mute, flexShrink: 0 }}>{fmtBytes(img.size)}</span>
                    <Btn label="✕ Remove" style="bad" disabled={!!actionBusy} onClick={() => { if (confirm(`Remove ${img.name}?`)) action(`/api/podman/images/${img.id}`, "DELETE"); }} />
                  </div>
                ))}
              </Section>
            </div>
          )}

          {/* PODS */}
          {!loading && tab === "pods" && (
            <Section title={`Pods (${pods.length})`}>
              {pods.length === 0 && <div style={{ color: PM.mute, fontSize: 12, textAlign: "center", padding: 24 }}>No pods. Pods are Podman-only — group containers like Kubernetes pods.</div>}
              {pods.map(p => (
                <div key={p.id} style={{ background: PM.panel2, border: `1px solid ${PM.line}`, borderRadius: 10, padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Dot ok={p.status === "Running"} />
                    <span style={{ font: `600 12px var(--mono)`, color: PM.text }}>{p.name}</span>
                    <span style={{ font: `10px var(--mono)`, color: PM.mute }}>{p.id}</span>
                    <span style={{ font: `10px var(--sans)`, color: PM.mute, marginLeft: "auto" }}>{p.containers} containers</span>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <Btn label="▶ Start"   style="ok"   disabled={!!actionBusy} onClick={() => action(`/api/podman/pods/${p.id}/start`)} />
                    <Btn label="■ Stop"    style="warn" disabled={!!actionBusy} onClick={() => action(`/api/podman/pods/${p.id}/stop`)} />
                    <Btn label="↺ Restart" style="mute" disabled={!!actionBusy} onClick={() => action(`/api/podman/pods/${p.id}/restart`)} />
                    <Btn label="✕ Remove"  style="bad"  disabled={!!actionBusy} onClick={() => { if (confirm(`Remove pod ${p.name}?`)) action(`/api/podman/pods/${p.id}/remove`); }} />
                  </div>
                </div>
              ))}
            </Section>
          )}

          {/* VOLUMES */}
          {!loading && tab === "volumes" && (
            <Section title={`Volumes (${volumes.length})`}>
              {volumes.length === 0 && <div style={{ color: PM.mute, fontSize: 12, textAlign: "center", padding: 16 }}>No volumes</div>}
              {volumes.map(v => (
                <div key={v.name} style={{ background: PM.panel2, border: `1px solid ${PM.line}`, borderRadius: 10, padding: "9px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ font: `600 12px var(--mono)`, color: PM.text, flex: 1 }}>{v.name}</span>
                    <span style={{ font: `10px var(--sans)`, color: PM.mute }}>{v.driver}</span>
                    <Btn label="✕ Remove" style="bad" disabled={!!actionBusy} onClick={() => { if (confirm(`Remove volume ${v.name}?`)) action(`/api/podman/volumes/${encodeURIComponent(v.name)}`, "DELETE"); }} />
                  </div>
                  {v.mountpoint && <div style={{ font: "10px var(--mono)", color: PM.mute }}>{v.mountpoint}</div>}
                </div>
              ))}
            </Section>
          )}

          {/* NETWORKS */}
          {!loading && tab === "networks" && (
            <Section title={`Networks (${networks.length})`}>
              {networks.length === 0 && <div style={{ color: PM.mute, fontSize: 12, textAlign: "center", padding: 16 }}>No networks</div>}
              {networks.map(n => (
                <div key={n.id} style={{ background: PM.panel2, border: `1px solid ${PM.line}`, borderRadius: 10, padding: "9px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ font: `600 12px var(--mono)`, color: PM.text, width: 120, flexShrink: 0 }}>{n.name}</span>
                  <span style={{ font: `10px var(--sans)`, color: PM.mute, width: 60 }}>{n.driver}</span>
                  <span style={{ font: `10px var(--mono)`, color: PM.mute, flex: 1 }}>{n.subnets}</span>
                  <span style={{ font: `10px var(--mono)`, color: PM.mute }}>{n.id}</span>
                </div>
              ))}
            </Section>
          )}

          {/* STATS */}
          {!loading && tab === "stats" && (
            <Section title="Live Resource Stats">
              <div style={{ font: "11px var(--sans)", color: PM.mute, marginBottom: 4 }}>Single snapshot — click Refresh for latest</div>
              {stats.length === 0 && <div style={{ color: PM.mute, fontSize: 12, textAlign: "center", padding: 16 }}>No running containers</div>}
              {stats.length > 0 && (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr>{["NAME","CPU","MEM USAGE","MEM %","NET I/O","PIDs"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "5px 10px", color: PM.mute, font: `700 9px/1 var(--sans)`, letterSpacing: ".1em", borderBottom: `1px solid ${PM.line}` }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {stats.map(s => (
                      <tr key={s.id}>
                        <td style={{ padding: "6px 10px", font: `600 11px var(--mono)`, color: PM.text }}>{s.name}</td>
                        <td style={{ padding: "6px 10px", font: `11px var(--mono)`, color: parseFloat(s.cpu_pct) > 50 ? PM.bad : PM.ok }}>{s.cpu_pct}</td>
                        <td style={{ padding: "6px 10px", font: `11px var(--mono)`, color: PM.mute }}>{s.mem_usage}</td>
                        <td style={{ padding: "6px 10px", font: `11px var(--mono)`, color: parseFloat(s.mem_pct) > 80 ? PM.bad : PM.text }}>{s.mem_pct}</td>
                        <td style={{ padding: "6px 10px", font: `11px var(--mono)`, color: PM.mute }}>{s.net_io}</td>
                        <td style={{ padding: "6px 10px", font: `11px var(--mono)`, color: PM.mute }}>{s.pids}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>
          )}

          {/* RUN */}
          {!loading && tab === "run" && (
            <div style={{ maxWidth: 640, display: "flex", flexDirection: "column", gap: 14 }}>
              <Section title="Run a Container">
                {[
                  { label: "Image *", val: runImage, set: setRunImage, placeholder: "nginx:latest" },
                  { label: "Name",    val: runName,  set: setRunName,  placeholder: "my-nginx" },
                  { label: "Ports",   val: runPorts, set: setRunPorts, placeholder: "8080:80, 443:443" },
                  { label: "Volumes", val: runVols,  set: setRunVols,  placeholder: "/host/path:/container/path" },
                  { label: "Env vars", val: runEnv, set: setRunEnv, placeholder: "KEY=value\nANOTHER=val" },
                  { label: "Command", val: runCmd,  set: setRunCmd,  placeholder: "optional override cmd" },
                ].map(f => (
                  <div key={f.label} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={{ font: "700 9px/1 var(--sans)", letterSpacing: ".1em", color: PM.mute }}>{f.label}</label>
                    {f.label === "Env vars" ? (
                      <textarea value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.placeholder} rows={3}
                        style={{ background: "#0d0a14", border: `1px solid ${PM.line}`, borderRadius: 6, padding: "6px 10px", font: "12px var(--mono)", color: PM.text, outline: "none", resize: "none" as const }} />
                    ) : (
                      <input value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.placeholder}
                        style={{ background: "#0d0a14", border: `1px solid ${PM.line}`, borderRadius: 6, padding: "6px 10px", font: "12px var(--mono)", color: PM.text, outline: "none" }} />
                    )}
                  </div>
                ))}
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, font: "11px var(--sans)", color: PM.mute, cursor: "pointer" }}>
                    <input type="checkbox" checked={runDetach} onChange={e => setRunDetach(e.target.checked)} />
                    Run detached (-d)
                  </label>
                </div>
                <Btn label="▶ Run Container" style="gold" disabled={!runImage || !!actionBusy}
                  onClick={async () => {
                    const r = await action("/api/podman/run", "POST", {
                      image: runImage, name: runName, ports: runPorts, env: runEnv,
                      volumes: runVols, detach: runDetach, cmd: runCmd,
                    });
                    if (r) { setRunOutput(r.output ?? ""); if (r.ok) load("containers"); }
                  }} />
                {runOutput && <pre style={{ font: "11px/1.4 var(--mono)", color: PM.mute, margin: 0, maxHeight: 120, overflow: "auto", background: "#080410", borderRadius: 6, padding: "8px 12px" }}>{runOutput}</pre>}
              </Section>
            </div>
          )}

          {/* CONVERT */}
          {tab === "workstation" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 780 }}>

              {/* Header row */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ font: "700 12px var(--sans)", color: PM.gold, letterSpacing: ".08em" }}>LLM WORKSTATION</span>
                <span style={{ font: "11px var(--sans)", color: PM.mute }}>— Jupyter · Ollama · Open WebUI · n8n</span>
                <button onClick={loadWorkstation} disabled={wsLoading} style={{ marginLeft: "auto", background: "none", border: 0, color: PM.mute, cursor: "pointer", fontSize: 14 }}>↺</button>
              </div>

              {/* Service cards */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {Object.entries(wsServices).map(([name, svc]) => (
                  <div key={name} style={{ background: PM.panel2, border: `1px solid ${svc.running ? "#1a4035" : PM.line}`, borderRadius: 8, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Dot ok={svc.running} />
                      <span style={{ font: "700 11px var(--sans)", color: svc.running ? PM.ok : PM.text }}>{svc.label}</span>
                      <span style={{ marginLeft: "auto", font: "10px var(--mono)", color: PM.mute }}>:{svc.port}</span>
                    </div>
                    {svc.running && (
                      <a href={svc.url} target="_blank" rel="noreferrer" style={{ font: "10px var(--mono)", color: PM.gold, textDecoration: "none" }}>{svc.url}</a>
                    )}
                    <div style={{ font: "10px var(--sans)", color: PM.mute, textTransform: "uppercase" as const, letterSpacing: ".08em" }}>{svc.state}</div>
                  </div>
                ))}
                {Object.keys(wsServices).length === 0 && (
                  <div style={{ gridColumn: "1/-1", font: "12px var(--sans)", color: PM.mute, padding: "12px 0" }}>
                    {wsLoading ? "Loading..." : "No workstation containers running — start a profile below."}
                  </div>
                )}
              </div>

              {/* Launch profiles */}
              <Section title="Launch Profile">
                <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 8 }}>
                  <Btn label={wsBusy === "lab" ? "Starting…" : "🧪 LAB  (Jupyter)"} style="gold" disabled={!!wsBusy} onClick={() => wsAction("lab")}
                    title="Jupyter Lab + transformers + langchain + gradio → :8888" />
                  <Btn label={wsBusy === "serve" ? "Starting…" : "🤖 SERVE  (Ollama + WebUI)"} style="ok" disabled={!!wsBusy} onClick={() => wsAction("serve")}
                    title="Ollama model server + Open WebUI → :11434 / :3000" />
                  <Btn label={wsBusy === "full" ? "Starting…" : "⚡ FULL  (All)"} style="warn" disabled={!!wsBusy} onClick={() => wsAction("full")}
                    title="Jupyter + Ollama + Open WebUI at once" />
                  <Btn label={wsBusy === "pipeline" ? "Starting…" : "🔀 PIPELINE  (n8n)"} style="mute" disabled={!!wsBusy} onClick={() => wsAction("pipeline")}
                    title="n8n workflow automation → :5678" />
                  <Btn label={wsBusy === "stop" ? "Stopping…" : "■ STOP ALL"} style="bad" disabled={!!wsBusy} onClick={wsStop} />
                </div>
              </Section>

              {/* Model manager */}
              <Section title="Ollama Models">
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" as const }}>
                  <select value={wsPullModel} onChange={e => setWsPullModel(e.target.value)}
                    style={{ background: PM.panel2, border: `1px solid ${PM.line}`, color: PM.text, borderRadius: 6, padding: "4px 8px", font: "11px var(--mono)", flex: "0 0 auto", minWidth: 160 }}>
                    <option value="phi3:mini">phi3:mini — 2.3 GB (best small)</option>
                    <option value="qwen2:0.5b">qwen2:0.5b — 394 MB (fastest)</option>
                    <option value="tinyllama">tinyllama — 637 MB (tiny)</option>
                    <option value="deepseek-coder:1.3b">deepseek-coder:1.3b — 776 MB (code)</option>
                    <option value="mistral:7b-instruct-q4_0">mistral:7b-q4 — 4.1 GB (best quality)</option>
                    <option value="codellama:7b-code-q4_K_M">codellama:7b-q4 — 3.8 GB (code)</option>
                    <option value="llama3.2:1b">llama3.2:1b — 1.3 GB (Meta)</option>
                  </select>
                  <input value={wsPullModel} onChange={e => setWsPullModel(e.target.value)} placeholder="or type any model:tag"
                    style={{ background: PM.panel2, border: `1px solid ${PM.line}`, color: PM.text, borderRadius: 6, padding: "4px 8px", font: "11px var(--mono)", flex: 1, minWidth: 140 }} />
                  <Btn label={wsBusy === "pull" ? "Pulling…" : "⬇ Pull"} style="gold" disabled={!!wsBusy || !wsPullModel.trim()} onClick={wsPull} />
                </div>
                {wsModels.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {wsModels.map(m => (
                      <div key={m.name} style={{ display: "flex", gap: 10, font: "11px var(--mono)", padding: "5px 8px", background: PM.panel2, borderRadius: 6, border: `1px solid ${PM.line}` }}>
                        <span style={{ color: PM.ok }}>✓</span>
                        <span style={{ color: PM.text, flex: 1 }}>{m.name}</span>
                        <span style={{ color: PM.mute }}>{m.size}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* Build lab image */}
              <Section title="Lab Image">
                <div style={{ font: "12px var(--sans)", color: PM.mute, lineHeight: 1.6 }}>
                  The <code style={{ color: PM.gold }}>crane-lab</code> image includes PyTorch (CPU), transformers, LangChain, LlamaIndex, Gradio, and Jupyter. Build once (~5 min), runs forever.
                </div>
                <Btn label={wsBusy === "build" ? "Building…" : "🔨 Build Lab Image"} style="gold" disabled={!!wsBusy} onClick={wsBuildLab} />
              </Section>

              {/* Output console */}
              {wsOutput && (
                <div style={{ background: "#080410", border: `1px solid ${PM.line}`, borderRadius: 8, padding: "10px 12px" }}>
                  <pre style={{ margin: 0, font: "11px/1.5 var(--mono)", color: PM.text, whiteSpace: "pre-wrap", maxHeight: 260, overflowY: "auto" }}>{wsOutput}</pre>
                </div>
              )}

              {/* Quick-ref model table */}
              <Section title="CPU-Friendly Models for This Laptop">
                <table style={{ width: "100%", borderCollapse: "collapse" as const, font: "11px var(--mono)" }}>
                  <thead>
                    <tr style={{ color: PM.mute, borderBottom: `1px solid ${PM.line}` }}>
                      {["Model", "Size", "Best For"].map(h => <th key={h} style={{ textAlign: "left" as const, padding: "4px 8px", fontWeight: 700 }}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["phi3:mini",            "2.3 GB", "General chat, reasoning, code"],
                      ["qwen2:0.5b",           "394 MB", "Fastest possible, ultra-light"],
                      ["tinyllama",            "637 MB", "Testing pipelines, low RAM"],
                      ["deepseek-coder:1.3b",  "776 MB", "Code gen, debugging"],
                      ["llama3.2:1b",          "1.3 GB", "Meta Llama, balanced"],
                      ["mistral:7b-q4",        "4.1 GB", "Best quality, needs 8GB RAM"],
                    ].map(([m, s, d]) => (
                      <tr key={m} style={{ borderBottom: `1px solid ${PM.line}20` }}>
                        <td style={{ padding: "5px 8px", color: PM.gold }}>{m}</td>
                        <td style={{ padding: "5px 8px", color: PM.text }}>{s}</td>
                        <td style={{ padding: "5px 8px", color: PM.mute }}>{d}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>
            </div>
          )}

          {!loading && tab === "convert" && (
            <div style={{ maxWidth: 700, display: "flex", flexDirection: "column", gap: 14 }}>
              <Section title="Docker → Podman Conversion">
                <div style={{ font: "12px var(--sans)", color: PM.mute, lineHeight: 1.6 }}>
                  Scans the active project for <code style={{ color: PM.gold }}>Dockerfile*</code> and <code style={{ color: PM.gold }}>docker-compose.*</code> files, patches them for Podman/rootless compatibility, and copies <code style={{ color: PM.gold }}>.dockerignore</code> → <code style={{ color: PM.gold }}>.containerignore</code>.
                </div>
                <Btn label="🔄 Convert Current Project" style="gold" disabled={!!actionBusy}
                  onClick={async () => {
                    const r = await fetch("/api/podman/convert", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).then(r => r.json());
                    setConvertResult(r);
                  }} />
                {convertResult && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ font: "11px var(--sans)", color: convertResult.ok ? PM.ok : PM.bad }}>{convertResult.message}</div>
                    {convertResult.changes.map((c, i) => (
                      <div key={i} style={{ display: "flex", gap: 10, font: "11px var(--mono)", padding: "5px 8px", background: PM.panel2, borderRadius: 6, border: `1px solid ${PM.line}` }}>
                        <span style={{ color: PM.gold, flexShrink: 0 }}>{c.file}</span>
                        <span style={{ color: PM.mute }}>→</span>
                        <span style={{ color: PM.text }}>{c.action}</span>
                      </div>
                    ))}
                    {convertResult.suggestions.map((s, i) => (
                      <div key={i} style={{ font: "11px var(--sans)", color: PM.warn, padding: "5px 8px", background: "#1f1308", borderRadius: 6, border: `1px solid #4a2a10` }}>💡 {s}</div>
                    ))}
                  </div>
                )}
              </Section>

              <Section title="Self-hosting with Podman">
                <div style={{ display: "flex", flexDirection: "column", gap: 6, font: "12px var(--sans)", color: PM.mute, lineHeight: 1.7 }}>
                  <div>• <strong style={{ color: PM.text }}>No daemon required</strong> — rootless, runs as your user</div>
                  <div>• <strong style={{ color: PM.text }}>Systemd integration</strong> — auto-start containers on boot (CONTAINERS tab → ⚙ Systemd)</div>
                  <div>• <strong style={{ color: PM.text }}>Drop-in docker-compose</strong> — <code style={{ color: PM.gold }}>podman compose up -d</code> works with your existing files</div>
                  <div>• <strong style={{ color: PM.text }}>Pods</strong> — group related containers (db + app + cache) like Kubernetes</div>
                  <div>• <strong style={{ color: PM.text }}>Ask Qwen</strong> — type <em style={{ color: PM.gold }}>"create a podman compose for nginx + postgres"</em> in chat</div>
                </div>
              </Section>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
