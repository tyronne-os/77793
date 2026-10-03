/**
 * CRANE Mastering Suite — Live talking avatar powered by Berylize + TTS
 *
 * Flow: mic → SpeechRecognition → /ws/avatar → Berylize → token stream
 *       → speakText(full response) → SpeechSynthesis + mouth animation
 *
 * Avatar states: idle | listening | thinking | speaking
 * TTS priority: 1) /api/services/kokoro/tts (Kokoro, port 8012)
 *               2) /api/services/speaches/tts (speaches, port 8013)
 *               3) browser SpeechSynthesis (always available)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useSocket } from "../hooks/useSocket";

type AvatarState = "idle" | "listening" | "thinking" | "speaking";
type Msg = { role: "user" | "avatar" | "error"; text: string };

const C = {
  bg:      "#0c0614",
  card:    "#140a20",
  border:  "#2a1e36",
  fg:      "#ece6f2",
  muted:   "#7a7280",
  gold:    "#d9b45a",
  goldBr:  "#f1dc92",
  purple:  "#a084d8",
  purpleDk:"#7c3aed",
  ok:      "#3ecf8e",
  blue:    "#60a5fa",
  orange:  "#e0782f",
  bad:     "#ff5d5d",
  warn:    "#f5b301",
};

// ── Avatar SVG ────────────────────────────────────────────────────────────────

export function AvatarFace({ state, mouthOpen, blink }: {
  state: AvatarState; mouthOpen: number; blink: boolean;
}) {
  const eyeRy = blink ? 1 : 13;
  const lipY  = 175 + mouthOpen * 28;
  const lipCtl= 152 + mouthOpen * 10;
  const mouthPath  = `M 108 168 Q ${lipCtl} ${lipY} 195 168`;
  const innerMouth = mouthOpen > 0.25
    ? `M 112 168 Q 152 ${lipY - 4} 190 168 L 192 170 Q 152 ${lipY + 8} 110 170 Z`
    : "";

  const glowColor = state === "listening" ? C.blue
    : state === "thinking"  ? C.purple
    : state === "speaking"  ? C.gold
    : C.purpleDk;
  const glowSize = state === "idle" ? 12 : 20;

  return (
    <svg viewBox="0 0 300 320" width="220" height="234" aria-label={`Avatar — ${state}`}>
      <defs>
        <radialGradient id="faceGrad" cx="50%" cy="45%">
          <stop offset="0%"   stopColor="#2a1a40" />
          <stop offset="100%" stopColor="#0d0618" />
        </radialGradient>
        <radialGradient id="glowGrad" cx="50%" cy="100%">
          <stop offset="0%"   stopColor={glowColor} stopOpacity="0.55" />
          <stop offset="100%" stopColor={glowColor} stopOpacity="0" />
        </radialGradient>
        <filter id="softGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="5" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="eyeGlow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="faceShad">
          <feDropShadow dx="0" dy="6" stdDeviation="14" floodColor="#000" floodOpacity="0.6"/>
        </filter>
      </defs>

      {/* ambient glow under face */}
      <ellipse cx="150" cy="310" rx="90" ry="22" fill={`url(#glowGrad)`}
        style={{ transition: "all 0.5s" }} />

      {/* neck */}
      <rect x="126" y="248" width="48" height="50" rx="8" fill="#1a0d28"
        style={{ filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.5))" }}/>

      {/* face circle */}
      <circle cx="150" cy="148" r="118" fill="url(#faceGrad)" filter="url(#faceShad)"/>

      {/* subtle face highlight */}
      <ellipse cx="120" cy="100" rx="55" ry="40" fill="rgba(160,132,216,0.07)"/>

      {/* cheek blush — active when speaking */}
      {(state === "speaking" || mouthOpen > 0.1) && <>
        <ellipse cx="86" cy="162" rx="20" ry="12" fill="rgba(224,120,47,0.14)"/>
        <ellipse cx="214" cy="162" rx="20" ry="12" fill="rgba(224,120,47,0.14)"/>
      </>}

      {/* ── eyes ── */}
      {/* left eye socket */}
      <ellipse cx="112" cy="132" rx="22" ry="20" fill="#0d0618" filter="url(#softGlow)"/>
      {/* left iris */}
      <ellipse cx="112" cy="132" rx="15" ry={eyeRy} fill={C.purpleDk}
        style={{ transition: "ry 0.08s" }}/>
      {/* left pupil */}
      {!blink && <ellipse cx="112" cy="132" rx="7" ry="9" fill="#06020e"/>}
      {/* left iris shine */}
      {!blink && <ellipse cx="108" cy="127" rx="4" ry="3" fill="rgba(255,255,255,0.55)"/>}
      {/* left glow ring when listening */}
      {state === "listening" && <ellipse cx="112" cy="132" rx="17" ry={eyeRy + 2}
        fill="none" stroke={C.blue} strokeWidth="1.5" opacity="0.6" filter="url(#eyeGlow)"/>}

      {/* right eye socket */}
      <ellipse cx="188" cy="132" rx="22" ry="20" fill="#0d0618" filter="url(#softGlow)"/>
      {/* right iris */}
      <ellipse cx="188" cy="132" rx="15" ry={eyeRy} fill={C.purpleDk}
        style={{ transition: "ry 0.08s" }}/>
      {/* right pupil */}
      {!blink && <ellipse cx="188" cy="132" rx="7" ry="9" fill="#06020e"/>}
      {/* right iris shine */}
      {!blink && <ellipse cx="184" cy="127" rx="4" ry="3" fill="rgba(255,255,255,0.55)"/>}
      {state === "listening" && <ellipse cx="188" cy="132" rx="17" ry={eyeRy + 2}
        fill="none" stroke={C.blue} strokeWidth="1.5" opacity="0.6" filter="url(#eyeGlow)"/>}

      {/* ── brow ── */}
      <path d="M 94 113 Q 112 107 130 112" stroke={C.gold} strokeWidth="2.5"
        fill="none" strokeLinecap="round"
        style={{ transform: state === "thinking" ? "translateY(-3px)" : "none", transition: "transform .3s" }}/>
      <path d="M 170 112 Q 188 107 206 113" stroke={C.gold} strokeWidth="2.5"
        fill="none" strokeLinecap="round"
        style={{ transform: state === "thinking" ? "translateY(-3px)" : "none", transition: "transform .3s" }}/>

      {/* ── nose ── */}
      <path d="M 150 140 L 144 162 Q 150 166 156 162 L 150 140" stroke={C.muted}
        strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.6"/>

      {/* ── mouth ── */}
      {innerMouth && (
        <path d={innerMouth} fill="#0a0314" opacity="0.9"/>
      )}
      <path d={mouthPath} stroke={C.gold} strokeWidth="2.8"
        fill="none" strokeLinecap="round"
        style={{ transition: "d 0.07s" }}/>

      {/* teeth hint when speaking wide */}
      {mouthOpen > 0.5 && (
        <rect x="122" y="169" width="58" height="8" rx="3"
          fill="rgba(235,225,210,0.85)" opacity={mouthOpen - 0.5}/>
      )}

      {/* ── thinking dots ── */}
      {state === "thinking" && (
        <g filter="url(#softGlow)">
          {[0,1,2].map(i => (
            <circle key={i} cx={130 + i * 20} cy={220} r="6" fill={C.purple}
              style={{ animationDelay: `${i * 0.2}s` }}
              className="think-dot"/>
          ))}
        </g>
      )}

      {/* ── listening pulse ring ── */}
      {state === "listening" && (
        <>
          <circle cx="150" cy="148" r="122" fill="none" stroke={C.blue}
            strokeWidth="2" opacity="0.25" className="listen-ring r1"/>
          <circle cx="150" cy="148" r="130" fill="none" stroke={C.blue}
            strokeWidth="1.5" opacity="0.15" className="listen-ring r2"/>
        </>
      )}

      {/* ── gold crown accent when speaking ── */}
      {state === "speaking" && (
        <path d="M 90 42 L 106 22 L 122 38 L 150 18 L 178 38 L 194 22 L 210 42"
          stroke={C.goldBr} strokeWidth="2.5" fill="none" strokeLinecap="round"
          strokeLinejoin="round" filter="url(#softGlow)" opacity="0.75"/>
      )}
    </svg>
  );
}

// ── waveform bars when speaking ───────────────────────────────────────────────

function AudioBars({ active }: { active: boolean }) {
  const bars = 20;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3, height: 36, marginTop: 8 }}>
      {Array.from({ length: bars }, (_, i) => (
        <div key={i} className={active ? "audio-bar active" : "audio-bar"} style={{
          width: 4, borderRadius: 2, background: C.gold,
          animationDelay: active ? `${(i * 0.07) % 0.6}s` : "0s",
          height: active ? undefined : "4px",
          opacity: active ? 1 : 0.2,
        }}/>
      ))}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function MasteringPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [avState, setAvState]     = useState<AvatarState>("idle");
  const [mouthOpen, setMouthOpen] = useState(0);
  const [blink, setBlink]         = useState(false);
  const [msgs, setMsgs]           = useState<Msg[]>([]);
  const [draft, setDraft]         = useState("");
  const [micOn, setMicOn]         = useState(false);
  const [ttsMode, setTtsMode]     = useState<"browser" | "kokoro" | "speaches">("browser");
  const [voiceList, setVoiceList] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceIdx, setVoiceIdx]   = useState(0);
  const [statusLine, setStatusLine] = useState("Ready");
  const scrollRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const micRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);
  const mouthTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingText = useRef("");
  const busyRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // blink loop
  useEffect(() => {
    const blinker = () => {
      setBlink(true);
      setTimeout(() => setBlink(false), 140);
    };
    const t = setInterval(blinker, 3500 + Math.random() * 2500);
    blinker();
    return () => clearInterval(t);
  }, []);

  // load browser voices
  useEffect(() => {
    const load = () => {
      const v = speechSynthesis.getVoices();
      if (v.length) setVoiceList(v);
    };
    load();
    speechSynthesis.onvoiceschanged = load;
  }, []);

  // scroll chat on new message
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 9999, behavior: "smooth" });
  }, [msgs]);

  // ── chat websocket (reuse the /ws/chat endpoint for avatar turns) ──────────
  const chat = useSocket("/ws/avatar-chat", (m) => {
    if (m.type === "token") {
      pendingText.current += m.delta;
      setMsgs(ms => {
        const last = ms[ms.length - 1];
        return last?.role === "avatar"
          ? [...ms.slice(0, -1), { ...last, text: last.text + m.delta }]
          : [...ms, { role: "avatar", text: m.delta }];
      });
    } else if (m.type === "done") {
      busyRef.current = false;
      const fullText = pendingText.current;
      pendingText.current = "";
      setAvState("speaking");
      setStatusLine("Speaking…");
      speakText(fullText);
    } else if (m.type === "error") {
      busyRef.current = false;
      setAvState("idle");
      setStatusLine("Error — try again");
      setMsgs(ms => [...ms, { role: "error", text: m.message }]);
    }
  });

  // ── send message to Berylize ──────────────────────────────────────────────
  const sendMessage = useCallback((text: string) => {
    const t = text.trim();
    if (!t || busyRef.current) return;
    busyRef.current = true;
    pendingText.current = "";
    setMsgs(ms => [...ms, { role: "user", text: t }, { role: "avatar", text: "" }]);
    setAvState("thinking");
    setStatusLine("Thinking…");
    chat.send({ message: t, active_file: null });
    setDraft("");
  }, [chat]);

  // ── TTS: speak a response ────────────────────────────────────────────────
  const startMouthAnim = () => {
    if (mouthTimer.current) clearInterval(mouthTimer.current);
    let phase = 0;
    mouthTimer.current = setInterval(() => {
      // natural open/close pattern: sine wave with some randomness
      phase += 0.4 + Math.random() * 0.3;
      setMouthOpen(Math.max(0, Math.sin(phase) * 0.55 + Math.random() * 0.2));
    }, 90);
  };

  const stopMouthAnim = () => {
    if (mouthTimer.current) { clearInterval(mouthTimer.current); mouthTimer.current = null; }
    setMouthOpen(0);
    setAvState("idle");
    setStatusLine("Ready");
    busyRef.current = false;
  };

  const speakText = useCallback(async (text: string) => {
    if (!text.trim()) { stopMouthAnim(); return; }

    // 1. Try Kokoro first
    if (ttsMode === "kokoro") {
      try {
        const r = await fetch("/api/services/kokoro/tts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text }),
        }).then(r => r.json());
        if (r.ok) {
          const audio = new Audio(`data:${r.content_type || "audio/wav"};base64,${r.audio_b64}`);
          audioRef.current = audio;
          startMouthAnim();
          audio.onended = stopMouthAnim;
          audio.onerror = () => stopMouthAnim();
          await audio.play();
          return;
        }
      } catch { /* fall through */ }
    }

    // 2. Try speaches
    if (ttsMode === "speaches") {
      try {
        const r = await fetch("/api/services/speaches/tts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text }),
        }).then(r => r.json());
        if (r.ok) {
          const audio = new Audio(`data:${r.content_type || "audio/wav"};base64,${r.audio_b64}`);
          audioRef.current = audio;
          startMouthAnim();
          audio.onended = stopMouthAnim;
          audio.onerror = () => stopMouthAnim();
          await audio.play();
          return;
        }
      } catch { /* fall through */ }
    }

    // 3. Browser SpeechSynthesis (always available)
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    if (voiceList[voiceIdx]) utterance.voice = voiceList[voiceIdx];
    utterance.rate  = 0.92;
    utterance.pitch = 1.05;
    synthRef.current = utterance;
    startMouthAnim();
    utterance.onend   = stopMouthAnim;
    utterance.onerror = () => stopMouthAnim();
    speechSynthesis.speak(utterance);
  }, [ttsMode, voiceList, voiceIdx]);

  // ── microphone (Web Speech API) ──────────────────────────────────────────
  const toggleMic = useCallback(() => {
    if (micOn) {
      micRef.current?.stop();
      setMicOn(false);
      setAvState("idle");
      setStatusLine("Ready");
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition) as (new () => {
      continuous: boolean; interimResults: boolean; lang: string;
      onstart: (() => void) | null; onresult: ((e: any) => void) | null;
      onerror: (() => void) | null; onend: (() => void) | null;
      start(): void; stop(): void;
    }) | undefined;
    if (!SR) {
      setStatusLine("Mic not supported in this browser");
      return;
    }
    const rec = new SR();
    rec.continuous      = false;
    rec.interimResults  = false;
    rec.lang            = "en-US";
    rec.onstart  = () => { setMicOn(true); setAvState("listening"); setStatusLine("Listening…"); };
    rec.onresult = (e: any) => {
      const text = e.results[0][0].transcript;
      setMicOn(false);
      sendMessage(text);
    };
    rec.onerror  = () => { setMicOn(false); setAvState("idle"); setStatusLine("Mic error — try again"); };
    rec.onend    = () => { setMicOn(false); if (avState === "listening") { setAvState("idle"); setStatusLine("Ready"); } };
    micRef.current = rec;
    rec.start();
  }, [micOn, avState, sendMessage]);

  // stop everything on close
  useEffect(() => {
    if (!open) {
      micRef.current?.stop();
      speechSynthesis.cancel();
      audioRef.current?.pause();
      stopMouthAnim();
      setMicOn(false);
    }
  }, [open]);

  if (!open) return null;

  const stateColor = avState === "listening" ? C.blue
    : avState === "thinking"  ? C.purple
    : avState === "speaking"  ? C.gold
    : C.muted;

  const stateLabel = { idle: "IDLE", listening: "LISTENING", thinking: "THINKING", speaking: "SPEAKING" }[avState];

  return (
    <div className="mastering-overlay">
      {/* ── header ── */}
      <div className="bp-overlay-header">
        <span className="bp-overlay-title" style={{ gap: 8 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
          </svg>
          MASTERING SUITE
        </span>
        <span style={{ fontSize: 10, fontFamily: "monospace", color: stateColor, letterSpacing: "0.15em",
          marginLeft: 12, padding: "2px 8px", border: `1px solid ${stateColor}44`,
          borderRadius: 999, background: `${stateColor}0e`, transition: "color .3s, border-color .3s" }}>
          {stateLabel}
        </span>
        <div style={{ flex: 1 }}/>
        {/* TTS selector */}
        <select value={ttsMode} onChange={e => setTtsMode(e.target.value as any)}
          style={{ background: C.card, border: `1px solid ${C.border}`, color: C.muted,
            borderRadius: 5, padding: "3px 8px", fontSize: 10, fontFamily: "monospace", cursor: "pointer" }}>
          <option value="browser">🔊 Browser TTS</option>
          <option value="kokoro">🎵 Kokoro (port 8012)</option>
          <option value="speaches">🗣 Speaches (port 8013)</option>
        </select>
        {ttsMode === "browser" && voiceList.length > 0 && (
          <select value={voiceIdx} onChange={e => setVoiceIdx(Number(e.target.value))}
            style={{ background: C.card, border: `1px solid ${C.border}`, color: C.muted,
              borderRadius: 5, padding: "3px 8px", fontSize: 10, maxWidth: 160, cursor: "pointer" }}>
            {voiceList.map((v, i) => <option key={i} value={i}>{v.name}</option>)}
          </select>
        )}
        <button className="bp-overlay-close" onClick={onClose}>×</button>
      </div>

      {/* ── body ── */}
      <div className="mastering-body">
        {/* ── avatar column ── */}
        <div className="mastering-avatar-col">
          <div className="mastering-avatar-stage">
            <AvatarFace state={avState} mouthOpen={mouthOpen} blink={blink}/>
            <AudioBars active={avState === "speaking"}/>
            <div style={{ marginTop: 10, fontSize: 11, color: stateColor, fontFamily: "monospace",
              letterSpacing: "0.1em", textAlign: "center", minHeight: 18, transition: "color .3s" }}>
              {statusLine}
            </div>
          </div>

          {/* controls */}
          <div className="mastering-controls">
            {/* mic button */}
            <button
              className={`mastering-mic-btn ${micOn ? "active" : ""}`}
              onClick={toggleMic}
              title={micOn ? "Stop listening" : "Start voice input"}
            >
              {micOn
                ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="3" width="6" height="11" rx="2"/><path d="M5 10v2a7 7 0 0 0 14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
                : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
              }
            </button>

            {/* stop / clear */}
            {(avState === "speaking" || avState === "thinking") && (
              <button className="mastering-stop-btn" onClick={() => {
                speechSynthesis.cancel();
                audioRef.current?.pause();
                chat.send({ type: "stop" });
                stopMouthAnim();
                busyRef.current = false;
              }} title="Stop">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
              </button>
            )}
          </div>
        </div>

        {/* ── transcript column ── */}
        <div className="mastering-transcript-col">
          <div className="mastering-messages" ref={scrollRef}>
            {msgs.length === 0 && (
              <div style={{ color: C.muted, fontSize: 12, textAlign: "center", paddingTop: 40, lineHeight: 1.7 }}>
                <div style={{ fontSize: 28, marginBottom: 12 }}>🎙️</div>
                <div>Click the mic or type below to begin.</div>
                <div style={{ fontSize: 11, marginTop: 8, color: "#6a6270" }}>
                  Berylize is listening — powered by Qwen 32B
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`mastering-msg ${m.role}`}>
                <span className="mastering-msg-label">
                  {m.role === "user" ? "YOU" : m.role === "avatar" ? "BERYLIZE" : "ERR"}
                </span>
                <span className="mastering-msg-text">{m.text}</span>
              </div>
            ))}
          </div>

          {/* text input */}
          <form className="mastering-input-row" onSubmit={e => { e.preventDefault(); sendMessage(draft); }}>
            <input
              className="mastering-input"
              placeholder="Type a message or click the mic…"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              disabled={busyRef.current}
            />
            <button type="submit" className="mastering-send-btn" disabled={!draft.trim() || busyRef.current}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
