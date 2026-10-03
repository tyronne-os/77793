/**
 * CRANE Model Lab — test any model from any pipeline side by side.
 * Sources: Kaggle (default), Ollama, llama.cpp, HuggingFace, NVIDIA NIM (every provider in opencode.jsonc).
 * The model id is free text, so any Hugging Face hub id / Ollama tag / NIM id can be tried.
 * Backend: /api/lab/* (src/server/modellab.py)
 */
import { useCallback, useEffect, useState } from "react";

type Source = { name: string; host: string; model: string; online: boolean; latency_ms?: number; models: string[]; error?: string };
type Target = { pipeline: string; model: string };
type Result = { pipeline: string; model: string; ok: boolean; text?: string; thinking?: string; note?: string; error?: string;
                ttft_ms?: number; total_ms?: number; tok_s?: number | null; queue_ms?: number };
type Pull = { done: boolean; status?: string; pct?: number; error?: string };

const GOLD = "#d9b45a", MUTED = "#7a7280", CARD = "#140a20", BORDER = "#2a1e36", FG = "#ece6f2", OK = "#3ecf8e", BAD = "#ff5d5d";
const PRESETS = [
  ["Sanity", "In one sentence, what is a live avatar?"],
  ["Persona", "You are Beryl, a warm, concise avatar host. Greet a new visitor in two sentences."],
  ["Code", "Write a Python function that returns the n-th Fibonacci number iteratively. Code only."],
  ["Reasoning", "A bat and ball cost $1.10 total; the bat costs $1 more than the ball. How much is the ball? Answer briefly."],
];
const inp: React.CSSProperties = { background: "#0c0614", border: `1px solid ${BORDER}`, color: FG, borderRadius: 5, padding: "6px 9px", fontSize: 12 };
const btn = (on = false): React.CSSProperties => ({ background: on ? GOLD : CARD, color: on ? "#1a1024" : FG, border: `1px solid ${on ? GOLD : BORDER}`,
  borderRadius: 6, padding: "6px 14px", fontWeight: 700, fontSize: 11, cursor: "pointer", letterSpacing: ".06em" });
const lbl: React.CSSProperties = { fontSize: 9, color: MUTED, letterSpacing: ".12em" };

export default function ModelLab({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [sources, setSources] = useState<Source[]>([]);
  const [def, setDef] = useState<string | null>(null);
  const [hints, setHints] = useState<Record<string, string>>({});
  const [pipe, setPipe] = useState("");
  const [model, setModel] = useState("");
  const [targets, setTargets] = useState<Target[]>([]);
  const [prompt, setPrompt] = useState(PRESETS[0][1]);
  const [temp, setTemp] = useState(0.3);
  const [maxTok, setMaxTok] = useState(300);
  const [results, setResults] = useState<Result[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [pullName, setPullName] = useState("");
  const [pull, setPull] = useState<Pull | null>(null);

  const load = useCallback(async () => {
    setErr("");
    try {
      const d = await (await fetch("/api/lab/sources")).json();
      setSources(d.pipelines); setDef(d.default); setHints(d.hints || {});
      setPipe(p => p || d.default || d.pipelines[0]?.name || "");
    } catch { setErr("Cannot reach the CRANE server (is it running on :8000?)"); }
  }, []);
  useEffect(() => { if (open) load(); }, [open, load]);

  const src = sources.find(s => s.name === pipe);
  useEffect(() => { if (src && !model) setModel(src.model); }, [src, model]);

  const add = (t: Target) => setTargets(ts => ts.some(x => x.pipeline === t.pipeline && x.model === t.model) || ts.length >= 6 ? ts : [...ts, t]);
  const run = async () => {
    if (!targets.length) return;
    setBusy(true); setResults(null); setErr("");
    try {
      const r = await fetch("/api/lab/compare", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, targets, temperature: temp, max_tokens: maxTok }) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setResults((await r.json()).results);
    } catch (e) { setErr(`Run failed: ${(e as Error).message}`); }
    setBusy(false);
  };
  const startPull = async () => {
    const m = pullName.trim(); if (!m) return;
    const r = await fetch("/api/lab/ollama-pull", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: m }) });
    if (!r.ok) { setPull({ done: true, error: "invalid model name" }); return; }
    setPull(await r.json());
    const t = setInterval(async () => {
      const s = await (await fetch(`/api/lab/ollama-pull/${encodeURIComponent(m)}`)).json();
      setPull(s); if (s.done) { clearInterval(t); load(); }
    }, 1500);
  };

  if (!open) return null;
  const fast = results?.filter(r => r.ok && r.ttft_ms != null).sort((a, b) => a.ttft_ms! - b.ttft_ms!)[0];
  const quick = results?.filter(r => r.ok && r.tok_s).sort((a, b) => b.tok_s! - a.tok_s!)[0];

  return (
    <div className="mastering-overlay">
      <div className="bp-overlay-header" style={{ gap: 10 }}>
        <span className="bp-overlay-title">MODEL LAB</span>
        {sources.map(s => (
          <span key={s.name} title={`${s.host} · ${s.models.length} models`} style={{ fontSize: 10, fontFamily: "monospace", color: s.online ? OK : BAD }}>
            ● {s.name}{s.name === def ? " ★" : ""}{s.online ? ` ${s.latency_ms ?? ""}ms` : " off"}
          </span>
        ))}
        <button style={{ ...btn(), padding: "2px 8px" }} onClick={load} title="Re-check sources">↻</button>
        <div style={{ flex: 1 }} />
        <button className="bp-overlay-close" onClick={onClose} aria-label="Close">✕</button>
      </div>

      <div style={{ padding: 16, overflowY: "auto", display: "grid", gap: 14, color: FG }}>
        {err && <div style={{ color: BAD, fontSize: 12 }}>{err}</div>}
        {src && !src.online && <div style={{ color: GOLD, fontSize: 11 }}>
          {src.name} is offline{src.name === "kaggle" ? ": the tunnel URL changes each notebook session. Run: bash scripts/kaggle_ops.sh sync" : "."}</div>}

        {/* 1. pick models */}
        <section style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 12, display: "grid", gap: 8 }}>
          <span style={lbl}>1 · PICK MODELS (UP TO 6) — Kaggle is the default source</span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select style={inp} value={pipe} onChange={e => { setPipe(e.target.value); setModel(sources.find(s => s.name === e.target.value)?.model || ""); }}>
              {sources.map(s => <option key={s.name} value={s.name}>{s.name}{s.online ? "" : " (offline)"}</option>)}
            </select>
            <input style={{ ...inp, flex: 1, minWidth: 260 }} list="lab-models" value={model} onChange={e => setModel(e.target.value)}
              placeholder="model id — pick from the list or type any id" />
            <datalist id="lab-models">{(src?.models || []).map(m => <option key={m} value={m} />)}</datalist>
            <button style={btn(true)} disabled={!model.trim() || !pipe} onClick={() => add({ pipeline: pipe, model: model.trim() })}>+ ADD</button>
          </div>
          {hints[pipe] && <span style={{ fontSize: 10, color: MUTED }}>{hints[pipe]}</span>}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {targets.length === 0 && <span style={{ fontSize: 11, color: MUTED }}>No models added yet.</span>}
            {targets.map((t, i) => (
              <span key={i} style={{ fontSize: 11, fontFamily: "monospace", border: `1px solid ${GOLD}66`, borderRadius: 999, padding: "2px 4px 2px 10px" }}>
                {t.pipeline}/{t.model}
                <button onClick={() => setTargets(ts => ts.filter((_, j) => j !== i))} aria-label="Remove" style={{ background: "none", border: 0, color: MUTED, cursor: "pointer" }}>✕</button>
              </span>
            ))}
          </div>
          {pipe === "local" && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={lbl}>OLLAMA PULL</span>
              <input style={{ ...inp, width: 240 }} value={pullName} onChange={e => setPullName(e.target.value)} placeholder="e.g. qwen2.5-coder:7b" />
              <button style={btn()} onClick={startPull}>PULL</button>
              {pull && <span style={{ fontSize: 11, color: pull.error ? BAD : pull.done ? OK : GOLD }}>{pull.error || `${pull.status ?? ""} ${pull.pct ?? 0}%`}</span>}
            </div>
          )}
        </section>

        {/* 2. prompt */}
        <section style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 12, display: "grid", gap: 8 }}>
          <span style={lbl}>2 · PROMPT</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {PRESETS.map(([n, p]) => <button key={n} style={{ ...btn(prompt === p), padding: "3px 10px" }} onClick={() => setPrompt(p)}>{n}</button>)}
          </div>
          <textarea style={{ ...inp, minHeight: 70, resize: "vertical" }} value={prompt} onChange={e => setPrompt(e.target.value)} />
          <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
            <span style={lbl}>TEMP</span><input style={{ ...inp, width: 60 }} type="number" step="0.1" min="0" max="1.5" value={temp} onChange={e => setTemp(+e.target.value)} />
            <span style={lbl}>MAX TOKENS</span><input style={{ ...inp, width: 80 }} type="number" step="50" min="16" max="600" value={maxTok} onChange={e => setMaxTok(+e.target.value)} />
            <div style={{ flex: 1 }} />
            <button style={{ ...btn(true), opacity: busy || !targets.length ? 0.5 : 1 }} disabled={busy || !targets.length} onClick={run}>
              {busy ? "RUNNING…" : `RUN ${targets.length || ""} MODEL${targets.length === 1 ? "" : "S"}`}
            </button>
          </div>
        </section>

        {/* 3. results */}
        {results && (
          <section style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))" }}>
            {results.map((r, i) => (
              <div key={i} style={{ background: CARD, border: `1px solid ${r.ok ? BORDER : BAD + "88"}`, borderRadius: 8, padding: 12, display: "grid", gap: 6, alignContent: "start" }}>
                <div style={{ fontFamily: "monospace", fontSize: 11, color: GOLD, wordBreak: "break-all" }}>{r.pipeline}/{r.model}</div>
                {r.ok ? <>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 10, fontFamily: "monospace" }}>
                    <span style={{ color: r === fast ? OK : MUTED }}>TTFT {r.ttft_ms}ms{r === fast ? " ★" : ""}</span>
                    <span style={{ color: r === quick ? OK : MUTED }}>{r.tok_s ?? "–"} tok/s{r === quick ? " ★" : ""}</span>
                    <span style={{ color: MUTED }}>total {r.total_ms}ms</span>
                    {!!r.queue_ms && <span style={{ color: MUTED }}>queued {r.queue_ms}ms</span>}
                  </div>
                  <div style={{ fontSize: 12, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{r.text || <em style={{ color: MUTED }}>(no answer text)</em>}</div>
                  {r.note && <div style={{ fontSize: 10, color: GOLD }}>{r.note}</div>}
                  {r.thinking && <details><summary style={{ fontSize: 10, color: MUTED, cursor: "pointer" }}>model's thinking</summary>
                    <div style={{ fontSize: 11, color: MUTED, whiteSpace: "pre-wrap" }}>{r.thinking}</div></details>}
                </> : <div style={{ color: BAD, fontSize: 11, wordBreak: "break-word" }}>{r.error}</div>}
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
