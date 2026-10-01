import { useEffect, useRef, useState } from "react";
import { splitReply } from "../liveWrite";

export type Msg = { role: "user" | "assistant" | "error"; text: string };
const IDEAS = ["Build a landing page for a coffee shop", "Make the header purple and gold", "Add a dark-mode toggle", "Make it more fun and playful"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SR = any;

export default function ChatPanel({ msgs, busy, ready, onSend, onStop, activeFile, tree }:
  { msgs: Msg[]; busy: boolean; ready: boolean; onSend: (t: string) => void; onStop: () => void;
    activeFile?: string | null; tree?: { name: string; path: string; dir?: boolean }[] }) {
  const [text, setText] = useState("");
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [pinnedFile, setPinnedFile] = useState<string | null>(null);
  const [cloneUrl, setCloneUrl] = useState<string | null>(null);  // null = hidden, "" = open
  const [listening, setListening] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [speechAvail] = useState(() => !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition));
  const end = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const recogRef = useRef<SR | null>(null);
  const baseTextRef = useRef("");  // text before interim transcript

  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs]);

  // auto-grow textarea
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 180) + "px";
  }, [text]);

  const send = () => {
    const t = text.trim();
    if (t && ready) { onSend(t); setText(""); setPinnedFile(null); }
  };

  const doClone = () => {
    if (!cloneUrl?.trim() || !ready) return;
    onSend(`Clone this into a new project: ${cloneUrl.trim()}`);
    setCloneUrl(null);
  };

  // ── voice input ──────────────────────────────────────────────────────────
  const startListening = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SRClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SRClass) return;
    const r: SR = new SRClass();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-US";
    baseTextRef.current = text;
    r.onresult = (e: SR) => {
      let interim = "";
      let finals = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finals += t + " ";
        else interim += t;
      }
      if (finals) baseTextRef.current = (baseTextRef.current + finals).trimStart();
      setText(baseTextRef.current + interim);
    };
    r.onerror = () => stopListening();
    r.onend = () => setListening(false);
    r.start();
    recogRef.current = r;
    setListening(true);
  };

  const stopListening = () => {
    recogRef.current?.stop();
    recogRef.current = null;
    setListening(false);
  };

  const toggleMic = () => listening ? stopListening() : startListening();

  useEffect(() => () => recogRef.current?.stop(), []);

  const files = (tree ?? []).filter(f => !f.dir);
  const displayFile = pinnedFile ?? activeFile;

  return (
    <section className="chat">
      <div className="chat-log">
        {!msgs.length && (
          <div className="chat-hello">
            <b>Tell Qwen what to build.</b>
            <span>Watch it appear. Interrupt any time with a correction.</span>
            <div className="chips">{IDEAS.map((i) => <button key={i} className="chip" disabled={!ready} onClick={() => onSend(i)}>{i}</button>)}</div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.role === "assistant"
              ? splitReply(m.text).map((p, j) => p.kind === "tool"
                ? <div key={j} className={`pill ${p.open ? "live" : ""}`}>{p.open ? "✎ " : "✓ "}{p.value}</div>
                : <p key={j}>{p.value.trim()}</p>)
              : <p>{m.text}</p>}
          </div>
        ))}
        {busy && <div className="typing"><i /><i /><i /></div>}
        <div ref={end} />
      </div>

      {/* ── Claude-style composer ── */}
      <div className={`composer2 ${!ready ? "disabled" : ""}`}>
        {/* pinned file pill */}
        {displayFile && (
          <div className="comp-context">
            <span className="comp-ctx-pill">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              {displayFile.split("/").pop()}
              {pinnedFile && <button className="ctx-remove" onClick={() => setPinnedFile(null)} title="Remove">×</button>}
            </span>
          </div>
        )}

        {/* file picker dropdown */}
        {showFilePicker && files.length > 0 && (
          <div className="file-picker">
            {files.map(f => (
              <button key={f.path} className="fp-row" onClick={() => { setPinnedFile(f.path); setShowFilePicker(false); }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                {f.path}
              </button>
            ))}
          </div>
        )}

        {/* clone URL bar */}
        {cloneUrl !== null && (
          <div className="clone-bar">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            <input autoFocus className="clone-input" placeholder="https://github.com/user/repo  or  https://example.com"
              value={cloneUrl} onChange={e => setCloneUrl(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") doClone(); if (e.key === "Escape") setCloneUrl(null); }} />
            <button className="clone-go" disabled={!cloneUrl?.trim()} onClick={doClone}>Clone</button>
            <button className="clone-cancel" onClick={() => setCloneUrl(null)}>✕</button>
          </div>
        )}

        {/* mic indicator banner */}
        {listening && (
          <div className="mic-banner">
            <span className="mic-pulse" />
            Listening… speak now
            <button className="mic-stop" onClick={stopListening}>Done</button>
          </div>
        )}

        <textarea
          ref={taRef}
          value={text}
          rows={1}
          placeholder={ready ? "Describe it, or tell Qwen what to change…" : "Open or create a project to start"}
          disabled={!ready && !busy}
          onChange={e => { setText(e.target.value); baseTextRef.current = e.target.value; }}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
        />

        {/* bottom toolbar */}
        <div className="comp-toolbar">
          <div className="comp-tools">
            {/* attach file */}
            <button className={`tool-btn ${showFilePicker ? "on" : ""}`} title="Reference a file"
              disabled={!ready || !files.length}
              onClick={() => setShowFilePicker(s => !s)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
            </button>

            {/* microphone */}
            {speechAvail && (
              <button
                className={`tool-btn mic-btn ${listening ? "on listening" : ""}`}
                title={listening ? "Stop listening" : "Voice input (Speech-to-Text)"}
                disabled={!ready && !listening}
                onClick={toggleMic}
              >
                {listening
                  ? <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--bad)" stroke="none"><rect x="3" y="3" width="18" height="18" rx="3"/></svg>
                  : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                      <line x1="12" y1="19" x2="12" y2="23"/>
                      <line x1="8" y1="23" x2="16" y2="23"/>
                    </svg>}
              </button>
            )}

            {/* clear chat */}
            {msgs.length > 0 && !busy && (
              <button className="tool-btn" title="Clear chat"
                onClick={() => {
                  const evt = new CustomEvent("crane-reset"); window.dispatchEvent(evt); }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
              </button>
            )}

            {/* clone / scrape URL */}
            <button className={`tool-btn ${cloneUrl !== null ? "on" : ""}`} title="Clone or scrape a URL into a project"
              disabled={!ready}
              onClick={() => setCloneUrl(c => c === null ? "" : null)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
              </svg>
            </button>

            {/* shift+enter hint */}
            <span className="comp-hint">Shift+↵ new line</span>
          </div>

          {/* send / stop */}
          {busy
            ? <button className="send-btn stop-btn" onClick={onStop} title="Stop">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
              </button>
            : <button className="send-btn" disabled={!ready || !text.trim()} onClick={send} title="Send (Enter)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
                </svg>
              </button>}
        </div>
      </div>
    </section>
  );
}
