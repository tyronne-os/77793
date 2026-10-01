import { useCallback, useEffect, useRef, useState } from "react";

type Tab = "live" | "sessions" | "settings";
type Status = "running" | "stopped" | "terminated" | "staging" | "unknown";

interface Metrics {
  instance_status: Status;
  gpu_util?: number;
  mem_util?: number;
  mem_used_mb?: number;
  mem_total_mb?: number;
  gpu_temp_c?: number;
  power_w?: number;
  power_limit_w?: number;
  uptime_h?: number;
  cost_usd?: number;
  idle_secs?: number;
  idle_until_pause?: number;
  hourly_rate?: number;
}

interface Session {
  ended_at: string;
  uptime_h: number;
  cost_usd: number;
  project: string;
  node: string;
}

interface GpuSettings {
  idle_timeout: number;
  hourly_rate: number;
}

const fmtTime = (secs: number) => {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}:${String(s).padStart(2, "0")}`;
};
const fmtUSD = (n: number) => `$${n.toFixed(3)}`;
const fmtMB = (mb: number) => mb >= 1024 ? `${(mb / 1024).toFixed(1)}G` : `${Math.round(mb)}M`;
const tempColor = (t: number) => t >= 80 ? "var(--bad)" : t >= 70 ? "var(--warn)" : "var(--ok)";

function Bar({ val, max = 100, color = "var(--accent)" }: { val: number; max?: number; color?: string }) {
  const pct = Math.min(100, (val / max) * 100);
  return (
    <div style={{ background: "var(--bg)", borderRadius: 4, height: 6, flex: 1, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4, transition: "width .4s" }} />
    </div>
  );
}

function MetricRow({ label, value, bar, barMax, barColor, sub }:
  { label: string; value: string; bar?: number; barMax?: number; barColor?: string; sub?: string }) {
  return (
    <div className="gm-row">
      <span className="gm-label">{label}</span>
      {bar !== undefined && <Bar val={bar} max={barMax} color={barColor} />}
      <span className="gm-val">{value}</span>
      {sub && <span className="gm-sub">{sub}</span>}
    </div>
  );
}

export default function GpuMeter({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("live");
  const [metrics, setMetrics] = useState<Metrics>({ instance_status: "unknown" });
  const [sessions, setSessions] = useState<Session[]>([]);
  const [gpuSettings, setGpuSettings] = useState<GpuSettings>({ idle_timeout: 900, hourly_rate: 0.40 });
  const [actionPending, setActionPending] = useState(false);
  const [idleInput, setIdleInput] = useState("15");
  const [rateInput, setRateInput] = useState("0.40");
  const ws = useRef<WebSocket | null>(null);
  const pingRef = useRef<number>();

  // live metrics via WebSocket
  useEffect(() => {
    if (!open) return;
    const connect = () => {
      const sock = new WebSocket(`ws://${location.host}/ws/gpu`);
      ws.current = sock;
      sock.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === "metrics") setMetrics(msg.data);
      };
      sock.onclose = () => { if (open) setTimeout(connect, 3000); };
      pingRef.current = window.setInterval(() => sock.readyState === 1 && sock.send("ping"), 20000);
    };
    connect();
    return () => { ws.current?.close(); clearInterval(pingRef.current); };
  }, [open]);

  // fetch sessions when tab switches
  const loadSessions = useCallback(() => {
    fetch("/api/gpu/sessions").then(r => r.json()).then(d => setSessions(d.sessions ?? []));
  }, []);

  useEffect(() => {
    if (tab === "sessions") loadSessions();
    if (tab === "settings") {
      fetch("/api/gpu/settings").then(r => r.json()).then(d => {
        setGpuSettings(d);
        setIdleInput(String(Math.round(d.idle_timeout / 60)));
        setRateInput(d.hourly_rate.toFixed(2));
      });
    }
  }, [tab, loadSessions]);

  const doAction = async (action: "start" | "pause") => {
    setActionPending(true);
    await fetch(`/api/gpu/${action}`, { method: "POST" }).catch(() => {});
    setActionPending(false);
  };

  const saveSettings = async () => {
    const body = { idle_timeout: (parseFloat(idleInput) || 15) * 60, hourly_rate: parseFloat(rateInput) || 0.40 };
    const d = await fetch("/api/gpu/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json());
    setGpuSettings(d);
  };

  if (!open) return null;

  const m = metrics;
  const isRunning = m.instance_status === "running";
  const powerEff = m.power_w && m.power_limit_w ? (m.power_w / m.power_limit_w) * 100 : undefined;
  const projDailyCost = m.cost_usd && m.uptime_h && m.uptime_h > 0 ? (m.cost_usd / m.uptime_h) * 24 : undefined;
  const totalCost = sessions.reduce((a, s) => a + s.cost_usd, 0);
  const totalHours = sessions.reduce((a, s) => a + s.uptime_h, 0);

  return (
    <div className="gm-panel">
      <div className="gm-header">
        <span className="gm-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}>
            <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
          </svg>
          BERYLIZE-NODE
        </span>
        <span className={`gm-status-dot ${isRunning ? "ok" : "off"}`} />
        <span className="gm-status-label">{m.instance_status}</span>
        <button className="gm-close" onClick={onClose}>×</button>
      </div>

      <div className="gm-tabs">
        {(["live", "sessions", "settings"] as Tab[]).map(t => (
          <button key={t} className={`gm-tab ${tab === t ? "on" : ""}`} onClick={() => setTab(t)}>
            {t === "live" ? "LIVE" : t === "sessions" ? "SESSIONS" : "⚙"}
          </button>
        ))}
      </div>

      {tab === "live" && (
        <div className="gm-body">
          {isRunning ? (
            <>
              {m.gpu_util !== undefined && (
                <MetricRow label="GPU" value={`${Math.round(m.gpu_util)}%`} bar={m.gpu_util} barColor="var(--ok)" />
              )}
              {m.mem_used_mb !== undefined && m.mem_total_mb !== undefined && (
                <MetricRow
                  label="VRAM"
                  value={`${fmtMB(m.mem_used_mb)} / ${fmtMB(m.mem_total_mb)}`}
                  bar={m.mem_used_mb} barMax={m.mem_total_mb}
                  barColor="var(--accent)"
                  sub={`${Math.round((m.mem_used_mb / m.mem_total_mb) * 100)}%`}
                />
              )}
              {m.gpu_temp_c !== undefined && (
                <MetricRow label="TEMP" value={`${Math.round(m.gpu_temp_c)}°C`}
                  bar={m.gpu_temp_c} barMax={100}
                  barColor={tempColor(m.gpu_temp_c)} />
              )}
              {m.power_w !== undefined && (
                <MetricRow label="POWER" value={`${Math.round(m.power_w)}W`}
                  bar={m.power_w} barMax={m.power_limit_w ?? 165}
                  barColor="var(--mute)"
                  sub={powerEff !== undefined ? `${Math.round(powerEff)}% cap` : undefined} />
              )}
              <div className="gm-divider" />
              {m.uptime_h !== undefined && (
                <MetricRow label="SESSION" value={fmtTime(Math.round(m.uptime_h * 3600))} />
              )}
              {m.cost_usd !== undefined && (
                <MetricRow label="COST" value={fmtUSD(m.cost_usd)}
                  sub={projDailyCost !== undefined ? `~${fmtUSD(projDailyCost)}/day` : undefined} />
              )}
              {m.idle_until_pause !== undefined && (
                <div className="gm-idle">
                  <span>Auto-pause in</span>
                  <span className={`gm-idle-val ${m.idle_until_pause < 120 ? "warn" : ""}`}>
                    {fmtTime(m.idle_until_pause)}
                  </span>
                  <div style={{ flex: 1, height: 3, background: "var(--bg)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{
                      width: `${Math.min(100, (m.idle_until_pause / (gpuSettings.idle_timeout || 900)) * 100)}%`,
                      height: "100%", background: m.idle_until_pause < 120 ? "var(--bad)" : "var(--ok)",
                      borderRadius: 2, transition: "width .5s"
                    }} />
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="gm-offline">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--mute)" strokeWidth="1.5">
                <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
                <line x1="4" y1="1" x2="20" y2="23" stroke="var(--bad)" strokeWidth="1.5"/>
              </svg>
              <span>{m.instance_status === "stopped" ? "GPU paused — billing stopped" : `Instance ${m.instance_status}`}</span>
            </div>
          )}

          <div className="gm-actions">
            {isRunning
              ? <button className="gm-btn danger" disabled={actionPending} onClick={() => doAction("pause")}>
                  {actionPending ? "Pausing…" : "⏸ Pause GPU"}
                </button>
              : <button className="gm-btn ok" disabled={actionPending} onClick={() => doAction("start")}>
                  {actionPending ? "Starting…" : "▶ Start GPU"}
                </button>}
          </div>
        </div>
      )}

      {tab === "sessions" && (
        <div className="gm-body">
          {sessions.length === 0
            ? <div className="gm-empty">No sessions logged yet.</div>
            : (
              <>
                <div className="gm-summary">
                  <span>{sessions.length} sessions</span>
                  <span>{totalHours.toFixed(1)}h total</span>
                  <span>{fmtUSD(totalCost)} spent</span>
                </div>
                <div className="gm-table-wrap">
                  <table className="gm-table">
                    <thead><tr><th>Date</th><th>Project</th><th>Duration</th><th>Cost</th></tr></thead>
                    <tbody>
                      {[...sessions].reverse().map((s, i) => (
                        <tr key={i}>
                          <td>{new Date(s.ended_at).toLocaleDateString()}</td>
                          <td>{s.project}</td>
                          <td>{fmtTime(Math.round(s.uptime_h * 3600))}</td>
                          <td>{fmtUSD(s.cost_usd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
        </div>
      )}

      {tab === "settings" && (
        <div className="gm-body">
          <div className="gm-setting">
            <label>Auto-pause after (minutes)</label>
            <input type="number" min="1" max="480" value={idleInput}
              onChange={e => setIdleInput(e.target.value)} className="gm-input" />
          </div>
          <div className="gm-setting">
            <label>Hourly rate ($/hr)</label>
            <input type="number" min="0" step="0.01" value={rateInput}
              onChange={e => setRateInput(e.target.value)} className="gm-input" />
          </div>
          <div className="gm-setting-note">
            Node: <b>{metrics.instance_status === "running" ? "running" : "stopped"}</b>
            &nbsp;·&nbsp; Zone: us-east1-c &nbsp;·&nbsp; g2-standard-4 + L4
          </div>
          <button className="gm-btn ok" onClick={saveSettings} style={{ marginTop: 8 }}>Save</button>
        </div>
      )}
    </div>
  );
}
