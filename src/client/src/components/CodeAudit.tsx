/**
 * CRANE Code — read-only VS Code style viewer for auditing the pipeline.
 * File tree + open tabs + CodeMirror. Includes the generated pipeline code (from the Beryl Suite)
 * and the saved triage log. Source comes from /api/source (secrets are redacted server side).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import CodePanel from "./CodePanel";

type F = { path: string; size: number };
const BG = "#0c0614", CARD = "#140a20", BORDER = "#2a1e36", FG = "#ece6f2", MUTED = "#7a7280", GOLD = "#d9b45a", GREEN = "#76b900";
const PROJECT_NAME = "CRANE-IT V1";
const GITHUB_REPO = "tyronne-os/77793";
const GITHUB_URL = `https://github.com/${GITHUB_REPO}`;
const VIRTUAL = [
  { path: "★ pipeline.generated.py", name: "pipeline.generated.py" },
  { path: "★ triage_reports.json", name: "triage_reports.json" },
];

export default function CodeAudit({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [files, setFiles] = useState<F[]>([]);
  const [tabs, setTabs] = useState<string[]>(["★ pipeline.generated.py"]);
  const [active, setActive] = useState("★ pipeline.generated.py");
  const [cache, setCache] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [err, setErr] = useState("");
  const [redacted, setRedacted] = useState(0);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch("/api/source/tree").then(r => r.json()).then(d => setFiles(d.files)).catch(() => setErr("Cannot reach the CRANE server."));
  }, [open]);

  const load = useCallback(async (path: string) => {
    if (path === "★ pipeline.generated.py") {
      let c = ""; try { c = localStorage.getItem("beryl-pipeline-code") || ""; } catch { /* storage off */ }
      setCache(m => ({ ...m, [path]: c || "# Open the BERYL SUITE tab once so the pipeline code can be generated." })); return;
    }
    if (path === "★ triage_reports.json") {
      const d = await fetch("/api/reports/triage").then(r => r.json()).catch(() => ({ records: [] }));
      setCache(m => ({ ...m, [path]: JSON.stringify(d, null, 2) })); return;
    }
    try {
      const r = await fetch(`/api/source/file?path=${encodeURIComponent(path)}`);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail ?? r.statusText);
      const d = await r.json(); setRedacted(d.redacted || 0);
      setCache(m => ({ ...m, [path]: d.content }));
    } catch (e) { setCache(m => ({ ...m, [path]: `# ${(e as Error).message}` })); }
  }, []);

  useEffect(() => { if (open) load(active); }, [open, active, load]);

  const downloadZip = async () => {
    setDownloading(true);
    try {
      const r = await fetch("/api/source/download");
      if (!r.ok) throw new Error(r.statusText);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "crane-codebase.zip"; a.click();
      URL.revokeObjectURL(url);
    } catch { alert("Download failed — check server logs."); }
    finally { setDownloading(false); }
  };

  const openFile = (p: string) => { setTabs(t => t.includes(p) ? t : [...t, p]); setActive(p); };
  const closeTab = (p: string) => setTabs(t => { const n = t.filter(x => x !== p); if (p === active) setActive(n[n.length - 1] ?? ""); return n; });

  const groups = useMemo(() => {
    const g: Record<string, F[]> = {};
    files.filter(f => !q || f.path.toLowerCase().includes(q.toLowerCase())).forEach(f => {
      const d = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : "(root)"; (g[d] ||= []).push(f); });
    return Object.entries(g).sort(([a], [b]) => a.localeCompare(b));
  }, [files, q]);

  if (!open) return null;
  const label = (p: string) => VIRTUAL.find(v => v.path === p)?.name ?? p.split("/").pop();
  const row = (p: string, text: string, star = false) => (
    <div key={p} onClick={() => openFile(p)} style={{ padding: "3px 10px 3px 22px", cursor: "pointer", fontSize: 12, fontFamily: "monospace", color: star ? GREEN : FG,
      background: active === p ? "#2a1e36" : "transparent", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={p}>{text}</div>);

  return (
    <div className="mastering-overlay">
      <div className="bp-overlay-header" style={{ gap: 12 }}>
        <span className="bp-overlay-title">{PROJECT_NAME} · CODE AUDIT</span>
        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: GREEN, textDecoration: "none", fontFamily: "monospace" }}>⎇ {GITHUB_REPO}</a>
        <span style={{ fontSize: 10, color: MUTED }}>read-only · {files.length} project files · secrets redacted{redacted ? ` (${redacted} hidden in this file)` : ""}</span>
        <div style={{ flex: 1 }} />
        <button onClick={downloadZip} disabled={downloading} style={{ background: "#1e3a1e", border: `1px solid ${GREEN}`, color: GREEN, borderRadius: 5, padding: "4px 10px", fontSize: 11, cursor: "pointer", fontFamily: "monospace" }}>
          {downloading ? "zipping…" : "⬇ ZIP"}
        </button>
        <button className="bp-overlay-close" onClick={onClose} aria-label="Close">✕</button>
      </div>
      {err && <div style={{ color: "#ff5d5d", fontSize: 12, padding: 8 }}>{err}</div>}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "280px 1fr", minHeight: 0, color: FG }}>
        <aside style={{ background: CARD, borderRight: `1px solid ${BORDER}`, overflowY: "auto" }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search files…" style={{ width: "calc(100% - 16px)", margin: 8, background: BG, border: `1px solid ${BORDER}`, color: FG, borderRadius: 5, padding: "5px 8px", fontSize: 12 }} />
          <div style={{ fontSize: 10, color: GREEN, letterSpacing: ".12em", padding: "4px 10px" }}>GENERATED / LIVE</div>
          {VIRTUAL.map(v => row(v.path, v.name, true))}
          {groups.map(([dir, fs]) => (
            <div key={dir}>
              <div onClick={() => setCollapsed(c => { const n = new Set(c); n.has(dir) ? n.delete(dir) : n.add(dir); return n; })}
                style={{ fontSize: 11, color: GOLD, padding: "6px 10px 2px", cursor: "pointer", fontFamily: "monospace" }}>{collapsed.has(dir) ? "▸" : "▾"} {dir}</div>
              {!collapsed.has(dir) && fs.map(f => row(f.path, f.path.split("/").pop() || f.path))}
            </div>))}
        </aside>
        <section style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
          <div style={{ display: "flex", overflowX: "auto", background: CARD, borderBottom: `1px solid ${BORDER}`, flex: "none" }}>
            {tabs.map(p => (
              <div key={p} onClick={() => setActive(p)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", cursor: "pointer", fontSize: 12, fontFamily: "monospace", whiteSpace: "nowrap",
                borderRight: `1px solid ${BORDER}`, borderTop: `2px solid ${active === p ? GOLD : "transparent"}`, background: active === p ? BG : "transparent", color: active === p ? FG : MUTED }}>
                {label(p)}<span onClick={e => { e.stopPropagation(); closeTab(p); }} style={{ color: MUTED }}>✕</span>
              </div>))}
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            {active ? <CodePanel path={active.replace("★ ", "")} content={cache[active] ?? "Loading…"} live={false} readOnly onEdit={() => {}} />
              : <div style={{ padding: 24, color: MUTED }}>Pick a file on the left.</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
