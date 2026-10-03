import { useEffect } from "react";

export type TipTopic = "start" | "cluster" | "modes" | "floor" | "results" | "persona" | "pipelines";
type Block = { h?: string; p?: string; list?: string[] };
const DOCS: { id: TipTopic; title: string; blocks: Block[] }[] = [
  { id: "start", title: "Quick start", blocks: [
    { p: "Multi-Suite runs 1-4 live avatars (\"suites\"). Use it to watch avatars converse, or to test and compare pipelines head to head." },
    { h: "Your first test in 60 seconds", list: [
      "Pick how many SUITES (top right). Each suite is one avatar with its own name, persona and optional pipeline.",
      "Check the green dots in the header: a pipeline must be online (●) to be used. Press ↻ to re-check.",
      "Choose CONVERSE (avatars talk to each other) or ARENA (same prompt to all, side-by-side).",
      "Type a topic or prompt and press START / RUN ARENA.",
      "Read the LEADERBOARD that appears when the run ends, then EXPORT RUN to keep the JSON.",
    ] },
    { h: "Sound", p: "Avatars speak with your browser's voices, one distinct voice and pitch per suite. Click the page once if the browser blocks audio. Arena mode is silent so the models are compared on speed and quality, not on speech." },
  ] },
  { id: "cluster", title: "Shared vs isolated cluster", blocks: [
    { p: "A pipeline is one model endpoint (local Ollama, the Kaggle GPU, berylize...). CLUSTER decides who uses which." },
    { h: "Shared", p: "All suites use ONE pipeline. Use this to see how one GPU cluster copes with several avatars, and to test conversation quality without changing hardware." },
    { h: "Isolated", p: "Each suite picks its own pipeline in 'suite settings'. Use this for head-to-head workflow tests: for example Beryl on Kaggle (30B) against Eve on local (3B)." },
    { h: "How to get a fair comparison", list: [
      "Change ONE variable at a time (model, or hardware, or temperature), never several.",
      "Keep personas and the prompt identical across suites when comparing models.",
      "Set temperature to the same value (lower = more repeatable) and run 3+ times before trusting a result.",
      "Each pipeline has its own concurrency gate (shown as queue time), so isolated pipelines really run in parallel while a shared one queues.",
    ] },
  ] },
  { id: "pipelines", title: "Adding and fixing pipelines", blocks: [
    { h: "Where pipelines come from", list: [
      "local: Ollama on this machine (CRANE_AVATAR_LLM_URL, CRANE_AVATAR_MODEL).",
      "Every provider in ~/.config/opencode/opencode.jsonc is picked up automatically (kaggle, berylize...).",
      "Extra ones: set CRANE_PIPELINES='{\"name\":{\"url\":\"http://host:port/v1\",\"model\":\"m\",\"concurrency\":2}}' and restart the server.",
    ] },
    { h: "A dot is red?", list: [
      "kaggle: the tunnel URL changes each notebook session. Run: bash scripts/kaggle_ops.sh sync",
      "berylize: reconnect the tunnel with: bash scripts/connect_berylize.sh",
      "local: start Ollama (systemctl status ollama) and make sure the model is pulled.",
    ] },
    { p: "The browser never supplies URLs: only pipeline names from this server-side list can be selected." },
  ] },
  { id: "modes", title: "Converse vs Arena", blocks: [
    { h: "Converse", p: "Avatars take turns replying to a shared transcript. Best for testing conversational feel, personas, turn-taking and how a model holds a long thread. The next avatar waits until the current one has finished speaking." },
    { h: "Arena", p: "The same prompt goes to every suite at the same time, one answer each. Best for comparing models or hardware: speed (TTFT, tokens/sec) and answer quality side by side." },
    { h: "Get the most from Arena", list: [
      "Use a prompt with a checkable answer (summarise this, write this function, explain X in two sentences).",
      "Run it several times; speeds vary with load, especially on shared GPUs.",
      "Give suites different models on the SAME pipeline to compare models, or the same model on DIFFERENT pipelines to compare hardware.",
    ] },
  ] },
  { id: "floor", title: "Floor control, barge-in and the loop guard", blocks: [
    { h: "FLOOR (who speaks next)", list: [
      "Round-robin: strict order. Predictable, best for repeatable tests.",
      "Random: never the same speaker twice in a row. Feels more like a group chat.",
      "Whoever is addressed: if a line names another suite (\"Atlas, what do you think?\") that suite answers next, otherwise round-robin. Works best with personas that address each other by name.",
    ] },
    { h: "Barge-in (interrupt as Host)", p: "While running, type in the Host box and press SAY. With BARGE ticked the current speaker is cut off mid-sentence, speech stops, and the next avatar answers your line. Untick it to add your line without interrupting." },
    { h: "Loop guard", p: "Small models sometimes repeat themselves. If 3 turns in a row are 60% or more repeats, the run stops and tells you. That is a useful result in itself: note which model/temperature looped. Raise temperature or sharpen personas to avoid it." },
  ] },
  { id: "persona", title: "Personas and settings", blocks: [
    { list: [
      "Persona: write who the avatar is and how it behaves in 1-3 sentences. Specific beats vague (\"a skeptical engineer who asks about latency\" beats \"smart\").",
      "Give avatars different viewpoints, otherwise they just agree with each other.",
      "Model: leave blank to use the pipeline's default, or pick from that pipeline's list.",
      "Temperature: 0.2-0.5 for repeatable tests, 0.8-1.0 for lively conversation. Above 1.2 gets erratic.",
      "Replies are kept to 1-3 spoken sentences on purpose, so turns stay fast and the voices sound natural.",
    ] },
  ] },
  { id: "results", title: "Reading the results", blocks: [
    { h: "On each suite tile", list: [
      "TTFT: time to first token. How long until the avatar starts to answer. This is what users feel as lag; under ~700ms feels live.",
      "tok/s: generation speed once it starts (counted in streamed chunks, which is close to tokens).",
      "repeat %: how much of the reply was already said earlier. Red means it is looping.",
    ] },
    { h: "Leaderboard", p: "Averages per suite over the run. Green marks the fastest TTFT and the highest tok/s. Words shows verbosity; diversity (1.0 = no repeated words) is a rough quality signal. Speed and quality trade off, so read them together." },
    { h: "Saved runs", p: "Every finished run is saved as JSON under runs/mastering/ with every turn, its pipeline, model, metrics and quality scores. EXPORT RUN downloads it. The same file format is produced by the headless runner: .venv/bin/python scripts/run_scenario.py tests/scenarios/head_to_head.json" },
    { h: "Queue time", p: "The saved JSON also records queue_ms: time a request waited for its pipeline's concurrency slot. High queue time on a shared pipeline means the cluster is the bottleneck, not the model." },
  ] },
];

export function TipButton({ topic, onOpen, label, title }: { topic: TipTopic; onOpen: (t: TipTopic) => void; label?: string; title?: string }) {
  return (
    <button type="button" onClick={() => onOpen(topic)} title={title ?? "Tips"} aria-label={`Tips: ${topic}`}
      style={{ background: "transparent", border: "1px solid #3a2e46", color: "#8a8290", borderRadius: 999, cursor: "pointer",
               fontSize: 10, fontWeight: 700, lineHeight: 1, padding: label ? "3px 9px" : "2px 6px", letterSpacing: ".08em" }}>
      {label ?? "?"}
    </button>
  );
}

export default function TipsOverlay({ topic, onTopic, onClose }: { topic: TipTopic | null; onTopic: (t: TipTopic) => void; onClose: () => void }) {
  useEffect(() => {
    if (!topic) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [topic, onClose]);
  if (!topic) return null;
  const doc = DOCS.find(d => d.id === topic) ?? DOCS[0];
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(6,3,12,.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-label="Multi-Suite tips"
        style={{ width: "min(760px,100%)", maxHeight: "86vh", display: "flex", background: "#140a20", border: "1px solid #3a2e46", borderRadius: 12, overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,.6)" }}>
        <div style={{ width: 190, background: "#0f0819", borderRight: "1px solid #2a1e36", padding: "14px 8px", overflowY: "auto", flex: "none" }}>
          <div style={{ fontSize: 10, letterSpacing: ".14em", color: "#d9b45a", fontWeight: 800, padding: "0 8px 10px" }}>TIPS</div>
          {DOCS.map(d => (
            <button key={d.id} onClick={() => onTopic(d.id)}
              style={{ display: "block", width: "100%", textAlign: "left", background: d.id === doc.id ? "#2a1e36" : "transparent", color: d.id === doc.id ? "#ece6f2" : "#8a8290",
                       border: 0, borderRadius: 6, padding: "7px 8px", fontSize: 12, cursor: "pointer", marginBottom: 2 }}>{d.title}</button>
          ))}
        </div>
        <div style={{ flex: 1, padding: "18px 22px", overflowY: "auto", color: "#ece6f2", fontSize: 13, lineHeight: 1.6 }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 17, color: "#f1dc92" }}>{doc.title}</h2>
            <div style={{ flex: 1 }} />
            <button onClick={onClose} aria-label="Close tips" style={{ background: "none", border: 0, color: "#8a8290", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
          </div>
          {doc.blocks.map((b, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              {b.h && <div style={{ fontSize: 11, letterSpacing: ".1em", color: "#d9b45a", fontWeight: 700, marginBottom: 3 }}>{b.h.toUpperCase()}</div>}
              {b.p && <p style={{ margin: 0 }}>{b.p}</p>}
              {b.list && <ul style={{ margin: "2px 0 0", paddingLeft: 18 }}>{b.list.map((l, j) => <li key={j} style={{ marginBottom: 3 }}>{l}</li>)}</ul>}
            </div>
          ))}
          <div style={{ fontSize: 10, color: "#6a6270", marginTop: 16 }}>Esc or click outside to close</div>
        </div>
      </div>
    </div>
  );
}
