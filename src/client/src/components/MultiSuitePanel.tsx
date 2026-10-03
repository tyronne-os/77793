/**
 * CRANE Multi-Suite — 1-4 Beryl avatar testing suites.
 *
 * CLUSTER  shared   : every suite runs on one pipeline (one GPU cluster powers all four)
 *          isolated : each suite picks its own pipeline (head-to-head workflow testing)
 * MODE     converse : avatars talk to each other (round-robin / random / mention policy, barge-in)
 *          arena    : one prompt answered by every suite in parallel, scored on a leaderboard
 * Backend: /ws/multi-avatar + /api/multiavatar/* (src/server/multiavatar.py)
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useSocket } from "../hooks/useSocket";
import { AvatarFace } from "./AvatarFace";
import TipsOverlay, { TipButton, TipTopic } from "./TipsOverlay";

type SeatState = "idle" | "thinking" | "speaking";
type Seat = { id: string; name: string; persona: string; pipeline: string; model: string; temperature: number };
type Metrics = { ttft_ms: number; tps: number; total_ms: number; queue_ms: number };
type Quality = { words: number; repetition: number; diversity: number };
type Line = { who: string; name: string; text: string; metrics?: Metrics; quality?: Quality; pipeline?: string };
type Pipeline = { name: string; host: string; model: string; online: boolean; latency_ms?: number; models: string[]; concurrency: number };
type Row = { name: string; pipeline: string; model: string; turns: number; avg_ttft_ms: number; avg_tps: number; avg_words: number; avg_repetition: number; avg_diversity: number };

const GOLD = "#d9b45a", MUTED = "#7a7280", CARD = "#140a20", BORDER = "#2a1e36", FG = "#ece6f2", OK = "#3ecf8e", BAD = "#ff5d5d";
const HUES = [0, 150, 260, 320];
const PITCH = [1.05, 0.8, 1.25, 0.95];
const PRESETS = [
  { id: "seat1", name: "Beryl", persona: "You are Beryl, the confident host of Beryl Labs. You are sharp, warm and a little witty." },
  { id: "seat2", name: "Atlas", persona: "You are Atlas, a skeptical engineer who stress-tests ideas and asks hard practical questions." },
  { id: "seat3", name: "Nova",  persona: "You are Nova, an imaginative designer who proposes bold, vivid ideas." },
  { id: "seat4", name: "Sage",  persona: "You are Sage, a calm moderator who summarises, finds common ground and steers toward decisions." },
];

export default function MultiSuitePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [count, setCount] = useState(2);
  const [seats, setSeats] = useState<Seat[]>(PRESETS.map(p => ({ ...p, pipeline: "local", model: "", temperature: 0.85 })));
  const [cluster, setCluster] = useState<"shared" | "isolated">("shared");
  const [sharedPipe, setSharedPipe] = useState("local");
  const [mode, setMode] = useState<"converse" | "arena">("converse");
  const [policy, setPolicy] = useState("round_robin");
  const [guard, setGuard] = useState(true);
  const [interrupt, setInterrupt] = useState(true);
  const [topic, setTopic] = useState("How should a live conversational avatar feel natural to talk to?");
  const [maxTurns, setMaxTurns] = useState(12);
  const [running, setRunning] = useState(false);
  const [turn, setTurn] = useState(0);
  const [states, setStates] = useState<Record<string, SeatState>>({});
  const [lines, setLines] = useState<Line[]>([]);
  const [live, setLive] = useState<Record<string, string>>({});
  const [last, setLast] = useState<Record<string, Line>>({});
  const [board, setBoard] = useState<Row[] | null>(null);
  const [runId, setRunId] = useState("");
  const [mouth, setMouth] = useState(0);
  const [blink, setBlink] = useState(false);
  const [host, setHost] = useState("");
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const [pipes, setPipes] = useState<Pipeline[]>([]);
  const [tip, setTip] = useState<TipTopic | null>(null);
  const active = useMemo(() => seats.slice(0, count), [seats, count]);
  const activeRef = useRef(active); activeRef.current = active;
  const modeRef = useRef(mode); modeRef.current = mode;
  const mouthTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const voices = useRef<SpeechSynthesisVoice[]>([]);
  const scroll = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = () => { voices.current = speechSynthesis.getVoices().filter(v => v.lang.startsWith("en")); };
    load(); speechSynthesis.onvoiceschanged = load;
    const t = setInterval(() => { setBlink(true); setTimeout(() => setBlink(false), 130); }, 3200);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { scroll.current?.scrollTo({ top: 99999, behavior: "smooth" }); }, [lines]);
  const refreshPipes = () => fetch("/api/multiavatar/pipelines").then(r => r.json()).then(d => setPipes(d.pipelines)).catch(() => setPipes([]));
  useEffect(() => { if (open) refreshPipes(); }, [open]);

  const stopMouth = () => { if (mouthTimer.current) clearInterval(mouthTimer.current); mouthTimer.current = null; setMouth(0); };
  const startMouth = () => {
    stopMouth(); let p = 0;
    mouthTimer.current = setInterval(() => { p += 0.4 + Math.random() * 0.3; setMouth(Math.max(0, Math.sin(p) * 0.55 + Math.random() * 0.2)); }, 90);
  };
  const speak = (idx: number, text: string, done: () => void) => {
    let finished = false;
    const end = () => { if (!finished) { finished = true; stopMouth(); done(); } };
    startMouth();
    if (!("speechSynthesis" in window) || !text) { setTimeout(end, Math.min(9000, 600 + text.length * 55)); return; }
    const u = new SpeechSynthesisUtterance(text);
    if (voices.current.length) u.voice = voices.current[idx % voices.current.length];
    u.pitch = PITCH[idx % 4]; u.rate = 0.95; u.onend = end; u.onerror = end;
    speechSynthesis.speak(u);
    setTimeout(end, 4000 + text.length * 120);   // some browsers never fire onend
  };

  const sock = useSocket("/ws/multi-avatar", (m) => {
    if (m.type === "started") { setRunning(true); setTurn(0); setLines([]); setLive({}); setLast({}); setBoard(null); setRunId(""); setMsg(null); setStates({}); }
    else if (m.type === "turn_start") { setStates(s => ({ ...s, [m.seat]: "thinking" })); setTurn(t => Math.max(t, m.turn + 1)); setLive(l => ({ ...l, [m.seat]: "" })); }
    else if (m.type === "token") setLive(l => ({ ...l, [m.seat]: (l[m.seat] ?? "") + m.text }));
    else if (m.type === "turn_done") {
      const idx = Math.max(0, activeRef.current.findIndex(s => s.id === m.seat));
      const line: Line = { who: m.seat, name: activeRef.current[idx]?.name ?? m.seat, text: m.text, metrics: m.metrics, quality: m.quality, pipeline: m.pipeline };
      setLines(l => [...l, line]); setLast(x => ({ ...x, [m.seat]: line })); setLive(l => ({ ...l, [m.seat]: m.text }));
      if (modeRef.current === "arena") { setStates(s => ({ ...s, [m.seat]: "idle" })); return; }
      setStates(s => ({ ...s, [m.seat]: "speaking" }));
      speak(idx, m.text, () => { setStates(s => ({ ...s, [m.seat]: "idle" })); sock.send({ type: "spoke", seat: m.seat }); });
    }
    else if (m.type === "interrupted") {
      speechSynthesis.cancel(); stopMouth();
      setStates(s => (m.seat === "*" ? {} : { ...s, [m.seat]: "idle" }));
      if (m.seat !== "*" && m.text) setLines(l => [...l, { who: m.seat, name: activeRef.current.find(s => s.id === m.seat)?.name ?? m.seat, text: m.text + " —" }]);
    }
    else if (m.type === "warning") setMsg({ text: m.message, bad: true });
    else if (m.type === "finished") { setRunning(false); setStates({}); setRunId(m.run_id ?? ""); setBoard(Object.values(m.summary ?? {}) as Row[]); }
    else if (m.type === "stopped") { setRunning(false); setStates({}); }
    else if (m.type === "error") { setRunning(false); setStates({}); setMsg({ text: m.message, bad: true }); }
  });

  const start = () => {
    speechSynthesis.cancel();
    sock.send({
      type: "start", mode, policy, guard, topic, max_turns: maxTurns, wait_for_speech: mode === "converse",
      seats: active.map(s => ({ ...s, pipeline: cluster === "shared" ? sharedPipe : s.pipeline, model: s.model || undefined })),
    });
  };
  const stop = () => { speechSynthesis.cancel(); stopMouth(); sock.send({ type: "stop" }); };
  const say = () => {
    const t = host.trim(); if (!t) return;
    sock.send({ type: "say", text: t, as: "Host", interrupt });
    setLines(l => [...l, { who: "human", name: "Host", text: t }]); setHost("");
  };
  const edit = (i: number, patch: Partial<Seat>) => setSeats(s => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const pipe = (n: string) => pipes.find(p => p.name === n);

  useEffect(() => { if (!open) { speechSynthesis.cancel(); stopMouth(); if (running) sock.send({ type: "stop" }); } }, [open]);
  if (!open) return null;

  const inp: React.CSSProperties = { background: "#0c0614", border: `1px solid ${BORDER}`, color: FG, borderRadius: 5, padding: "5px 8px", fontSize: 11 };
  const btn = (on = false): React.CSSProperties => ({
    background: on ? GOLD : CARD, color: on ? "#1a1024" : FG, border: `1px solid ${on ? GOLD : BORDER}`,
    borderRadius: 6, padding: "5px 12px", fontWeight: 700, fontSize: 11, cursor: "pointer", letterSpacing: ".06em",
  });
  const lbl: React.CSSProperties = { fontSize: 9, color: MUTED, letterSpacing: ".12em" };
  const chip = (t: string, c = MUTED): JSX.Element => (
    <span style={{ fontSize: 9, fontFamily: "monospace", color: c, border: `1px solid ${c}55`, borderRadius: 999, padding: "1px 7px" }}>{t}</span>);
  const best = (f: (r: Row) => number, min: boolean) => board && board.length > 1 ? (min ? Math.min : Math.max)(...board.map(f)) : NaN;
  const bt = best(r => r.avg_ttft_ms, true), bp = best(r => r.avg_tps, false);

  return (
    <div className="mastering-overlay">
      <div className="bp-overlay-header" style={{ gap: 10 }}>
        <span className="bp-overlay-title">MULTI-SUITE</span>
        {pipes.map(p => (
          <span key={p.name} title={`${p.host} · ${p.model}`} style={{ fontSize: 10, fontFamily: "monospace", color: p.online ? OK : BAD }}>
            ● {p.name}{p.online && p.latency_ms != null ? ` ${p.latency_ms}ms` : " off"}
          </span>
        ))}
        <button style={{ ...btn(), padding: "2px 8px" }} onClick={refreshPipes} title="Re-check pipelines">↻</button>
        <TipButton topic="pipelines" onOpen={setTip} title="Pipelines: where they come from and fixing red dots" />
        <div style={{ flex: 1 }} />
        <TipButton topic="start" onOpen={setTip} label="TIPS" title="How to use Multi-Suite and get the most from testing" />
        <span style={lbl}>SUITES</span>
        {[1, 2, 3, 4].map(n => (
          <button key={n} disabled={running} onClick={() => setCount(n)} style={{ ...btn(count === n), padding: "3px 10px", opacity: running ? 0.5 : 1 }}>{n}</button>
        ))}
        <button className="bp-overlay-close" style={{ marginLeft: 10 }} onClick={onClose}>×</button>
      </div>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: count === 1 ? "1fr" : "1fr 1fr", gap: 12, alignContent: "start" }}>
            {active.map((s, i) => {
              const st = states[s.id] ?? "idle", l = last[s.id], pl = cluster === "shared" ? sharedPipe : s.pipeline;
              return (
                <div key={s.id} style={{ background: CARD, border: `1px solid ${st === "speaking" ? GOLD : BORDER}`, borderRadius: 10, padding: 12, transition: "border-color .3s" }}>
                  <div style={{ display: "flex", justifyContent: "center", filter: `hue-rotate(${HUES[i]}deg)` }}>
                    <AvatarFace state={st} mouthOpen={st === "speaking" ? mouth : 0} blink={blink} />
                  </div>
                  <div style={{ textAlign: "center", fontSize: 12, fontWeight: 800, letterSpacing: ".12em", color: GOLD }}>{s.name.toUpperCase()}</div>
                  <div style={{ display: "flex", justifyContent: "center", gap: 5, flexWrap: "wrap", margin: "4px 0 6px" }}>
                    {chip(st.toUpperCase(), st === "idle" ? MUTED : GOLD)}
                    {chip(`${pl}${(s.model || pipe(pl)?.model) ? ` · ${s.model || pipe(pl)?.model}` : ""}`, "#a084d8")}
                    {l?.metrics && chip(`TTFT ${l.metrics.ttft_ms}ms`, "#60a5fa")}
                    {l?.metrics && chip(`${l.metrics.tps} tok/s`, OK)}
                    {l?.quality && l.quality.repetition >= 0.5 && chip(`repeat ${Math.round(l.quality.repetition * 100)}%`, BAD)}
                  </div>
                  <div style={{ minHeight: 44, fontSize: 12, color: FG, lineHeight: 1.45, textAlign: "center" }}>{live[s.id] ?? ""}</div>
                  <details style={{ marginTop: 8 }}>
                    <summary style={{ fontSize: 10, color: MUTED, cursor: "pointer" }}>suite settings <TipButton topic="persona" onOpen={setTip} title="Personas, model and temperature" /></summary>
                    <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
                      <input style={inp} value={s.name} disabled={running} onChange={e => edit(i, { name: e.target.value })} placeholder="Name" />
                      {cluster === "isolated" && (
                        <select style={inp} value={s.pipeline} disabled={running} onChange={e => edit(i, { pipeline: e.target.value })}>
                          {(pipes.length ? pipes : [{ name: "local" } as Pipeline]).map(p => <option key={p.name} value={p.name}>{p.name}{p.online === false ? " (offline)" : ""}</option>)}
                        </select>
                      )}
                      <input style={inp} value={s.model} disabled={running} list={`ms-m-${i}`} onChange={e => edit(i, { model: e.target.value })} placeholder={`Model (default ${pipe(pl)?.model ?? "…"})`} />
                      <datalist id={`ms-m-${i}`}>{(pipe(pl)?.models ?? []).map(m => <option key={m} value={m} />)}</datalist>
                      <label style={lbl}>TEMPERATURE {s.temperature.toFixed(2)}
                        <input type="range" min={0} max={1.5} step={0.05} value={s.temperature} disabled={running} style={{ width: "100%" }} onChange={e => edit(i, { temperature: Number(e.target.value) })} />
                      </label>
                      <textarea style={{ ...inp, minHeight: 54, resize: "vertical" }} value={s.persona} disabled={running} onChange={e => edit(i, { persona: e.target.value })} />
                    </div>
                  </details>
                </div>
              );
            })}
          </div>

          {board && board.length > 0 && (
            <div style={{ marginTop: 14, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 12 }}>
              <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
                <span style={{ ...lbl, color: GOLD, fontSize: 11, fontWeight: 800, marginRight: 8 }}>LEADERBOARD</span>
                <TipButton topic="results" onOpen={setTip} title="How to read these numbers" />
                <div style={{ flex: 1 }} />
                {runId && <a href={`/api/multiavatar/runs/${runId}`} download={`${runId}.json`} style={{ ...btn(), textDecoration: "none" }}>⬇ EXPORT RUN</a>}
              </div>
              <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse", fontFamily: "monospace" }}>
                <thead><tr style={{ color: MUTED, textAlign: "left" }}>{["SUITE", "PIPELINE", "TURNS", "TTFT", "TOK/S", "WORDS", "REPEAT", "DIVERSITY"].map(h => <th key={h} style={{ padding: "3px 6px", fontWeight: 600 }}>{h}</th>)}</tr></thead>
                <tbody>{board.map(r => (
                  <tr key={r.name + r.pipeline} style={{ color: FG, borderTop: `1px solid ${BORDER}` }}>
                    <td style={{ padding: "4px 6px", color: GOLD }}>{r.name}</td><td style={{ padding: "4px 6px" }}>{r.pipeline} · {r.model}</td><td style={{ padding: "4px 6px" }}>{r.turns}</td>
                    <td style={{ padding: "4px 6px", color: r.avg_ttft_ms === bt ? OK : FG }}>{Math.round(r.avg_ttft_ms)}ms</td>
                    <td style={{ padding: "4px 6px", color: r.avg_tps === bp ? OK : FG }}>{r.avg_tps}</td>
                    <td style={{ padding: "4px 6px" }}>{r.avg_words}</td>
                    <td style={{ padding: "4px 6px", color: r.avg_repetition >= 0.5 ? BAD : FG }}>{Math.round(r.avg_repetition * 100)}%</td>
                    <td style={{ padding: "4px 6px" }}>{r.avg_diversity}</td>
                  </tr>))}</tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ width: 370, borderLeft: `1px solid ${BORDER}`, display: "flex", flexDirection: "column", background: "#0f0819" }}>
          <div style={{ padding: 12, display: "grid", gap: 8, borderBottom: `1px solid ${BORDER}` }}>
            <div style={{ display: "flex", gap: 6 }}>
              {(["converse", "arena"] as const).map(m => <button key={m} disabled={running} style={{ ...btn(mode === m), flex: 1 }} onClick={() => setMode(m)}>{m === "converse" ? "💬 CONVERSE" : "⚔ ARENA"}</button>)}
              <TipButton topic="modes" onOpen={setTip} title="Converse vs Arena" />
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={lbl}>CLUSTER</span>
              <TipButton topic="cluster" onOpen={setTip} title="Shared vs isolated, and how to compare fairly" />
              <select style={{ ...inp, flex: 1 }} disabled={running} value={cluster} onChange={e => setCluster(e.target.value as "shared" | "isolated")}>
                <option value="shared">Shared — one pipeline powers all suites</option>
                <option value="isolated">Isolated — each suite has its own pipeline</option>
              </select>
            </div>
            {cluster === "shared" && (
              <select style={inp} disabled={running} value={sharedPipe} onChange={e => setSharedPipe(e.target.value)}>
                {(pipes.length ? pipes : [{ name: "local" } as Pipeline]).map(p => <option key={p.name} value={p.name}>{p.name}{p.online === false ? " (offline)" : ` — ${p.model}`}</option>)}
              </select>
            )}
            <textarea style={{ ...inp, minHeight: 50, resize: "vertical" }} value={topic} disabled={running} onChange={e => setTopic(e.target.value)} placeholder={mode === "arena" ? "Prompt sent to every suite" : "Conversation topic"} />
            {mode === "converse" && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={lbl}>FLOOR</span>
                <TipButton topic="floor" onOpen={setTip} title="Turn policies, barge-in and the loop guard" />
                <select style={inp} disabled={running} value={policy} onChange={e => setPolicy(e.target.value)}>
                  <option value="round_robin">Round-robin</option><option value="random">Random</option><option value="mention">Whoever is addressed</option>
                </select>
                <span style={lbl}>TURNS</span>
                <input type="number" min={1} max={200} style={{ ...inp, width: 56 }} value={maxTurns} disabled={running} onChange={e => setMaxTurns(Number(e.target.value) || 1)} />
                <label style={{ ...lbl, display: "flex", gap: 4, alignItems: "center" }}><input type="checkbox" checked={guard} disabled={running} onChange={e => setGuard(e.target.checked)} />LOOP GUARD</label>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {running && mode === "converse" && <span style={{ fontSize: 10, color: MUTED, fontFamily: "monospace" }}>turn {turn}/{maxTurns}</span>}
              <div style={{ flex: 1 }} />
              {running ? <button style={btn()} onClick={stop}>■ STOP</button>
                       : <button style={btn(true)} disabled={!sock.open} onClick={start}>▶ {mode === "arena" ? "RUN ARENA" : "START"}</button>}
            </div>
            {msg && <div style={{ fontSize: 11, color: msg.bad ? BAD : OK }}>{msg.text}</div>}
          </div>

          <div ref={scroll} style={{ flex: 1, overflowY: "auto", padding: 12, display: "grid", gap: 8, alignContent: "start" }}>
            {lines.length === 0 && <div style={{ color: MUTED, fontSize: 12, lineHeight: 1.5 }}>
              <b style={{ color: FG }}>Converse:</b> suites talk to each other; interject as Host any time.<br />
              <b style={{ color: FG }}>Arena:</b> every suite answers the same prompt in parallel — compare speed and quality.<br />
              <b style={{ color: FG }}>Isolated:</b> give each suite its own pipeline for head-to-head workflow tests.</div>}
            {lines.map((l, i) => (
              <div key={i} style={{ fontSize: 12, lineHeight: 1.45 }}>
                <span style={{ color: l.who === "human" ? "#60a5fa" : GOLD, fontWeight: 700, fontSize: 10, letterSpacing: ".1em" }}>{l.name.toUpperCase()} </span>
                {l.metrics && <span style={{ fontSize: 9, color: MUTED, fontFamily: "monospace" }}>[{l.pipeline} · {l.metrics.ttft_ms}ms · {l.metrics.tps} tok/s] </span>}
                <span style={{ color: FG }}>{l.text}</span>
              </div>
            ))}
          </div>

          <form style={{ display: "flex", gap: 6, padding: 10, borderTop: `1px solid ${BORDER}`, alignItems: "center" }} onSubmit={e => { e.preventDefault(); say(); }}>
            <input style={{ ...inp, flex: 1 }} value={host} onChange={e => setHost(e.target.value)} placeholder="Interject as Host…" disabled={!running || mode === "arena"} />
            <label style={{ ...lbl, display: "flex", gap: 3, alignItems: "center" }} title="Cut off whoever is speaking"><input type="checkbox" checked={interrupt} onChange={e => setInterrupt(e.target.checked)} />BARGE</label>
            <button style={btn()} disabled={!running || !host.trim() || mode === "arena"}>SAY</button>
          </form>
        </div>
      </div>
      <TipsOverlay topic={tip} onTopic={setTip} onClose={() => setTip(null)} />
    </div>
  );
}
