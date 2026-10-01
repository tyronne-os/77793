import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ChatPanel, { Msg } from "./components/ChatPanel";
import CodePanel from "./components/CodePanel";
import FileTree, { TreeItem } from "./components/FileTree";
import BackendPanel from "./components/BackendPanel";
import GpuMeter from "./components/GpuMeter";
import VaultPanel from "./components/VaultPanel";
import PreviewPanel, { PreviewHandle } from "./components/PreviewPanel";
import TerminalPanel from "./components/TerminalPanel";
import { useSocket } from "./hooks/useSocket";
import { liveWrite } from "./liveWrite";

type View = "code" | "preview" | "split";
type Mode = "auto" | "plan";
type Status = { ok: boolean; model: string | null; project: string | null; preview: boolean; mode?: Mode };
const j = (url: string, body?: unknown, method = body ? "POST" : "GET") =>
  fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
    .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail ?? r.statusText); return r.json(); });

export default function App() {
  const [view, setView] = useState<View>("preview");            // opens on the live preview
  const [status, setStatus] = useState<Status | null>(null);
  const [mode, setMode] = useState<Mode>("auto");
  const [projects, setProjects] = useState<string[]>([]);
  const [project, setProject] = useState<string | null>(null);
  const [tree, setTree] = useState<TreeItem[]>([]);
  const [files, setFiles] = useState<Record<string, string>>({});
  const [active, setActive] = useState<string | null>(null);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [termOpen, setTermOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [gpuOpen, setGpuOpen] = useState(false);
  const [backendOpen, setBackendOpen] = useState(false);
  const [vaultOpen, setVaultOpen] = useState(false);
  const preview = useRef<PreviewHandle>(null);
  const activeRef = useRef(active); activeRef.current = active;
  const treeRef = useRef(tree); treeRef.current = tree;
  const reloadTimer = useRef<number>();

  // ---- status / projects -------------------------------------------------------
  const refreshStatus = useCallback(() => j("/api/status").then(s => { setStatus(s); if (s.mode) setMode(s.mode); }).catch(() => setStatus(null)), []);
  useEffect(() => { refreshStatus(); const t = setInterval(refreshStatus, 5000); return () => clearInterval(t); }, [refreshStatus]);
  useEffect(() => { j("/api/projects").then((r) => { setProjects(r.projects); }); }, []);
  useEffect(() => { if (status) { setRunning(status.preview); if (status.project && !project) openProject(status.project); } }, [status]); // eslint-disable-line

  const toggleMode = async () => {
    const next: Mode = mode === "auto" ? "plan" : "auto";
    await j("/api/settings", { mode: next });
    setMode(next);
  };

  const refreshTree = useCallback(() => j("/api/tree").then((r) => setTree(r.tree)), []);

  async function openProject(name: string) {
    const r = await j("/api/projects/open", { name });
    setProject(r.name); setTree(r.tree); setFiles({}); setActive(null); setTouched(new Set()); setMsgs([]);
    setRunning(false); setPreviewErr(null);
    j("/api/projects").then((p) => setProjects(p.projects));
    const first = r.tree.find((t: TreeItem) => !t.dir && /(App|index|main)\.(tsx|jsx|html|js)$/.test(t.name)) ?? r.tree.find((t: TreeItem) => !t.dir);
    if (first) openFile(first.path);
    if (r.tree.length) startPreview();
  }
  async function createProject(name: string) {
    const r = await j("/api/projects", { name });
    setNaming(false);
    await openProject(r.name);
  }
  async function openFile(path: string) {
    setActive(path);
    // Always fetch on explicit click — watcher events can race with file creation
    // and set an empty string in the cache before the write completes.
    if (files[path] === undefined || files[path] === "") {
      const r = await j(`/api/file?path=${encodeURIComponent(path)}`).catch(() => ({ content: "" }));
      setFiles((f) => ({ ...f, [path]: r.content }));
    }
  }
  async function startPreview() {
    setStarting(true); setPreviewErr(null);
    const r = await j("/api/process/start", {}).catch((e) => ({ ok: false, error: String(e) }));
    setStarting(false); setRunning(!!r.ok);
    if (!r.ok) setPreviewErr([r.error, r.log].filter(Boolean).join("\n"));
  }
  async function stopPreview() { await j("/api/process/stop", {}); setRunning(false); }

  // ---- file watcher stream -----------------------------------------------------
  useSocket("/ws/files", (m) => {
    if (m.event === "delete" || m.event === "tree" || !treeRef.current.some((t) => t.path === m.path)) refreshTree();
    if (m.event === "change" && m.content !== undefined) {
      setFiles((f) => ({ ...f, [m.path]: m.content }));
      setTouched((s) => new Set(s).add(m.path));
      if (!activeRef.current) setActive(m.path);
      // vite hot-reloads itself; a plain static folder needs a nudge
      if (!treeRef.current.some((t) => t.name === "package.json")) {
        clearTimeout(reloadTimer.current);
        reloadTimer.current = window.setTimeout(() => preview.current?.reload(), 150);
      }
    }
  });

  // ---- chat stream -------------------------------------------------------------
  const chat = useSocket("/ws/chat", (m) => {
    if (m.type === "token") setMsgs((ms) => { const l = ms[ms.length - 1];
      return l?.role === "assistant" ? [...ms.slice(0, -1), { ...l, text: l.text + m.delta }] : [...ms, { role: "assistant", text: m.delta }]; });
    else if (m.type === "step") setMsgs((ms) => ms.at(-1)?.role === "assistant" ? [...ms, { role: "assistant", text: "" }] : ms);
    else if (m.type === "error") { setBusy(false); setMsgs((ms) => [...ms, { role: "error", text: m.message }]); }
    else if (m.type === "done") {
      setBusy(false); refreshTree();
      setMsgs((ms) => ms.filter((x) => x.text.trim() || x.role !== "assistant"));
      if (!running) startPreview();
    }
  });
  const send = (text: string) => {
    if (!chat.send({ message: text, active_file: active })) return;
    setMsgs((ms) => [...ms, { role: "user", text }, { role: "assistant", text: "" }]);
    setBusy(true);
  };
  const stop = () => { chat.send({ type: "stop" }); setBusy(false); };

  // clear-chat from composer toolbar
  useEffect(() => {
    const handler = () => { chat.send({ type: "reset" }); setMsgs([]); setBusy(false); };
    window.addEventListener("crane-reset", handler);
    return () => window.removeEventListener("crane-reset", handler);
  }, [chat]); // eslint-disable-line

  // what Qwen is typing right now (partial write_file in the last reply)
  const live = useMemo(() => busy ? liveWrite(msgs.filter((m) => m.role === "assistant").at(-1)?.text ?? "") : null, [busy, msgs]);
  const liveOn = !!live && !live.done;
  const shownPath = liveOn ? live!.path : active;
  const shownContent = liveOn ? live!.content : active ? files[active] ?? "" : "";

  const online = !!status?.ok, modelUp = !!status?.model;
  return (
    <div className="app">
      <header className="top">
        <div className="brand"><span className="mark">🏗️</span> CRANE <small>BUILDER</small></div>
        <div className="proj">
          {naming
            ? <NewProject onCreate={createProject} onCancel={() => setNaming(false)} />
            : <>
              <select value={project ?? ""} onChange={(e) => e.target.value && openProject(e.target.value)}>
                <option value="">{projects.length ? "Choose project…" : "No projects yet"}</option>
                {projects.map((p) => <option key={p}>{p}</option>)}
              </select>
              <button className="btn" onClick={() => setNaming(true)}>＋ New</button></>}
        </div>
        <div className="seg" role="tablist" aria-label="View">
          <button className={view === "code" ? "on" : ""} onClick={() => setView("code")}>CODE</button>
          <button className={view === "preview" ? "on" : ""} onClick={() => setView("preview")}>PREVIEW</button>
          <button className={view === "split" ? "on" : ""} onClick={() => setView("split")} title="Side by side">⊞</button>
        </div>
        <div className="right">
          {/* mode toggle */}
          <button className={`mode-toggle ${mode}`} onClick={toggleMode} title={mode === "auto" ? "AUTO: full autonomous — click to switch to PLAN mode" : "PLAN: think then act — click to switch to AUTO mode"}>
            {mode === "auto"
              ? <><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg> AUTO</>
              : <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> PLAN</>}
          </button>
          {project && (running ? <button className="btn" onClick={stopPreview}>■ Stop</button> : <button className="btn" onClick={startPreview} disabled={starting}>▶ Run</button>)}
          <button className={`btn ${termOpen ? "on" : ""}`} onClick={() => setTermOpen((t) => !t)} disabled={!project}>⌨</button>
          {/* GPU meter toggle */}
          <button className={`btn gpu-btn ${gpuOpen ? "on" : ""}`} onClick={() => setGpuOpen(o => !o)} title="GPU usage meter — berylize-node">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 6V4M10 6V4M14 6V4M18 6V4M6 18v2M10 18v2M14 18v2M18 18v2"/></svg>
            GPU
          </button>
          <span className={`status ${modelUp ? "ok" : online ? "warn" : "bad"}`} title={status?.model ?? "Qwen not reachable"}>
            <i />{modelUp ? (status!.model!.split("/").pop()?.slice(0, 16)) : online ? "offline" : "offline"}
          </span>
          {/* settings → backend panel */}
          <button className="btn" onClick={() => setBackendOpen(o => !o)} title="Backend — AI node graph">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
            </svg>
          </button>
          {/* vault */}
          <button className="btn" onClick={() => setVaultOpen(o => !o)} title="Secure token vault">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </button>
        </div>
      </header>
      <GpuMeter open={gpuOpen} onClose={() => setGpuOpen(false)} />
      <BackendPanel open={backendOpen} onClose={() => setBackendOpen(false)} />
      <VaultPanel open={vaultOpen} onClose={() => setVaultOpen(false)} />

      <main className="body">
        <ChatPanel msgs={msgs} busy={busy} ready={!!project && chat.open} onSend={send} onStop={stop} activeFile={active} tree={tree} />
        <section className="stage">
          {liveOn && <div className="livebar"><i />Qwen is writing <b>{live!.path}</b>
            {view === "preview" && <button onClick={() => setView("split")}>watch the code</button>}</div>}
          <div className={`panes ${view}`}>
            {view !== "preview" && (
              <div className="pane code">
                <aside className="files"><FileTree items={tree} active={shownPath} touched={touched} onOpen={openFile} /></aside>
                <div className="editor">
                  <div className="tab">{shownPath ?? "no file open"}{liveOn && <em>● LIVE</em>}</div>
                  <CodePanel path={shownPath} content={shownContent} live={liveOn}
                    onEdit={(v) => { if (active) { setFiles((f) => ({ ...f, [active]: v })); j("/api/file", { path: active, content: v }, "PUT").catch(() => {}); } }} />
                </div>
              </div>)}
            {view !== "code" && (
              <div className="pane prev"><PreviewPanel ref={preview} running={running} starting={starting} error={previewErr} onStart={startPreview} /></div>)}
          </div>
          {termOpen && project && <div className="term"><TerminalPanel project={project} /></div>}
        </section>
      </main>
    </div>
  );
}

function NewProject({ onCreate, onCancel }: { onCreate: (n: string) => void; onCancel: () => void }) {
  const [n, setN] = useState("");
  return (
    <form className="newp" onSubmit={(e) => { e.preventDefault(); n.trim() && onCreate(n); }}>
      <input autoFocus placeholder="project name" value={n} onChange={(e) => setN(e.target.value)} onKeyDown={(e) => e.key === "Escape" && onCancel()} />
      <button className="btn primary" type="submit">Create</button>
      <button className="btn" type="button" onClick={onCancel}>✕</button>
    </form>
  );
}
