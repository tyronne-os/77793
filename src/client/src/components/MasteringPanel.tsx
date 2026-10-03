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

/** Resting face for each emotion label the performance plan can return. */
const EMO_BASE: Record<string, Cues> = {
  neutral:    { browLift: 0,    browKnit: 0,    smile: 0.1 },
  warm:       { browLift: 0.2,  browKnit: 0,    smile: 0.5 },
  happy:      { browLift: 0.3,  browKnit: 0,    smile: 0.8 },
  amused:     { browLift: 0.2,  browKnit: 0,    smile: 0.6 },
  curious:    { browLift: 0.6,  browKnit: 0,    smile: 0.2 },
  concerned:  { browLift: 0.3,  browKnit: -0.8, smile: -0.2 },
  apologetic: { browLift: 0.2,  browKnit: -0.9, smile: -0.3 },
  serious:    { browLift: -0.2, browKnit: 0.5,  smile: 0 },
  excited:    { browLift: 0.7,  browKnit: 0,    smile: 0.9 },
};

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

/** Numeric face cues (driven by JEV's typed performance plan). All optional; zero = neutral. */
export type Cues = {
  browLift?: number; browKnit?: number;   // -1..1 : knit>0 = frown/concentrate, knit<0 = worried (inner brows up)
  smile?: number;                         // -1..1
  gx?: number; gy?: number;               // gaze offset in SVG units
  nod?: number; lean?: number;            // px / 0..1
  breath?: number;                        // 0..1 breathing depth
};

export function AvatarFace({ state, mouthOpen, blink, cues = {} }: {
  state: AvatarState; mouthOpen: number; blink: boolean; cues?: Cues;
}) {
  const gx = cues.gx ?? 0, gy = cues.gy ?? 0, smile = cues.smile ?? 0;
  const browY = (state === "thinking" ? -3 : 0) - (cues.browLift ?? 0) * 7;
  const knit = (cues.browKnit ?? 0) * 12;
  const gazeStyle = { transform: `translate(${gx}px, ${gy}px)`, transition: "transform .18s ease-out" };
  const browBase = { transformBox: "fill-box" as const, transformOrigin: "center", transition: "transform .25s ease-out" };
  const eyeRy = blink ? 1 : 13;
  const lipY  = 175 + mouthOpen * 28;
  const lipCtl= 152 + mouthOpen * 10;
  const cornerY = 168 - smile * 6;
  const mouthPath  = `M 108 ${cornerY} Q ${lipCtl} ${lipY + smile * 4} 195 ${cornerY}`;
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

      <g style={{ transform: `translateY(${cues.nod ?? 0}px) scale(${1 + (cues.lean ?? 0) * 0.04})`, transformOrigin: "150px 170px", transition: "transform .22s ease-out" }}>
      <g className="av-breathe" style={{ ["--breath" as string]: `${(cues.breath ?? 0.3) * 3}px` }}>
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
        style={{ ...gazeStyle, transition: "ry 0.08s, transform .18s ease-out" }}/>
      {/* left pupil */}
      {!blink && <ellipse cx="112" cy="132" rx="7" ry="9" fill="#06020e" style={gazeStyle}/>}
      {/* left iris shine */}
      {!blink && <ellipse cx="108" cy="127" rx="4" ry="3" fill="rgba(255,255,255,0.55)" style={gazeStyle}/>}
      {/* left glow ring when listening */}
      {state === "listening" && <ellipse cx="112" cy="132" rx="17" ry={eyeRy + 2}
        fill="none" stroke={C.blue} strokeWidth="1.5" opacity="0.6" filter="url(#eyeGlow)"/>}

      {/* right eye socket */}
      <ellipse cx="188" cy="132" rx="22" ry="20" fill="#0d0618" filter="url(#softGlow)"/>
      {/* right iris */}
      <ellipse cx="188" cy="132" rx="15" ry={eyeRy} fill={C.purpleDk}
        style={{ ...gazeStyle, transition: "ry 0.08s, transform .18s ease-out" }}/>
      {/* right pupil */}
      {!blink && <ellipse cx="188" cy="132" rx="7" ry="9" fill="#06020e" style={gazeStyle}/>}
      {/* right iris shine */}
      {!blink && <ellipse cx="184" cy="127" rx="4" ry="3" fill="rgba(255,255,255,0.55)" style={gazeStyle}/>}
      {state === "listening" && <ellipse cx="188" cy="132" rx="17" ry={eyeRy + 2}
        fill="none" stroke={C.blue} strokeWidth="1.5" opacity="0.6" filter="url(#eyeGlow)"/>}

      {/* ── brow ── */}
      <path d="M 94 113 Q 112 107 130 112" stroke={C.gold} strokeWidth="2.5"
        fill="none" strokeLinecap="round"
        style={{ ...browBase, transform: `translateY(${browY}px) rotate(${knit}deg)` }}/>
      <path d="M 170 112 Q 188 107 206 113" stroke={C.gold} strokeWidth="2.5"
        fill="none" strokeLinecap="round"
        style={{ ...browBase, transform: `translateY(${browY}px) rotate(${-knit}deg)` }}/>

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
      </g>
      </g>
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
  const pendingTextLen = useRef(0);
  const busyRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // JEV: realism cues + receipt
  const [cues, setCues]       = useState<Cues>({ smile: 0.1 });
  const [selfCheck, setSelfCheck] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ checked: number; flagged: number; clean_rate: number | null; nodes: Record<string, { checked: number; flagged: number }> } | null>(null);
  const perfRef  = useRef<any>(null);      // eslint-disable-line @typescript-eslint/no-explicit-any
  const percRef  = useRef<any>(null);      // eslint-disable-line @typescript-eslint/no-explicit-any
  const microLast = useRef(-9);
  const turnNo   = useRef(0);
  const partialSent = useRef("");
  const micSent  = useRef(false);

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
    } else if (m.type === "jev") {
      percRef.current = m.perception;
      setCues(c => ({ ...c, ...EMO_BASE[m.perception.mood === "calm" ? "serious" : m.perception.mood === "caring" ? "concerned" : m.perception.mood] ?? {} }));
    } else if (m.type === "jev_perf") {
      perfRef.current = m.performance;
    } else if (m.type === "jev_proprio") {
      setSelfCheck(m.check.consistent ? null : `self-check: that reply claims a state or ability the avatar lacks (${Math.round(Math.max(m.check.contradicts, m.check.overclaims) * 100)}%)`);
    } else if (m.type === "done") {
      busyRef.current = false;
      fetch("/api/jev/receipt").then(r => r.json()).then(setReceipt).catch(() => {});
      const fullText = pendingText.current;
      pendingTextLen.current = fullText.length;
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
    perfRef.current = null; setSelfCheck(null); turnNo.current += 1;
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
    const pf = perfRef.current, pc = percRef.current;
    const arousal = pf?.arousal ?? 0.5;
    utterance.rate  = Math.max(0.7, Math.min(1.25, 0.92 * (0.9 + 0.2 * arousal) * (pc?.tts?.rate ?? 1)));
    utterance.pitch = Math.max(0.8, Math.min(1.3, (1.05 + (arousal - 0.5) * 0.15) * (pc?.tts?.pitch ?? 1)));
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
    rec.interimResults  = true;
    partialSent.current = ""; micSent.current = false;
    rec.lang            = "en-US";
    rec.onstart  = () => { setMicOn(true); setAvState("listening"); setStatusLine("Listening…"); };
    rec.onresult = (e: any) => {
      const r = e.results[e.results.length - 1];
      const text = r[0].transcript as string;
      if (micSent.current) return;
      if (r.isFinal) { micSent.current = true; setMicOn(false); sendMessage(text); return; }
      // interim: ask JEV whether the thought is finished, and how a listener would react (throttled)
      if (text.length - partialSent.current.length < 12) return;
      partialSent.current = text;
      fetch("/api/jev/turn", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) })
        .then(x => x.json()).then(v => {
          if (micSent.current) return;
          if (v.listener_cue === "nod") { setCues(c => ({ ...c, nod: 4 })); setTimeout(() => setCues(c => ({ ...c, nod: 0 })), 240); }
          else if (v.listener_cue === "lean_in") setCues(c => ({ ...c, lean: 0.7, browLift: 0.4 }));
          else if (v.listener_cue === "concern") setCues(c => ({ ...c, browKnit: -0.7, browLift: 0.3 }));
          if (v.respond_now && text.trim().split(/\s+/).length >= 3) {      // answer now instead of waiting out the silence timer
            micSent.current = true; rec.stop(); setMicOn(false); sendMessage(text);
          }
        }).catch(() => {});
    };
    rec.onerror  = () => { setMicOn(false); setAvState("idle"); setStatusLine("Mic error — try again"); };
    rec.onend    = () => { setMicOn(false); if (avState === "listening") { setAvState("idle"); setStatusLine("Ready"); } };
    micRef.current = rec;
    rec.start();
  }, [micOn, avState, sendMessage]);

  // JEV choreography: while speaking, play the performance plan; otherwise settle into the resting expression
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (ms: number, fn: () => void) => { timers.push(setTimeout(fn, ms)); };
    if (avState === "idle") { setCues({ smile: 0.1 }); return; }
    if (avState === "listening") { setCues(c => ({ ...c, lean: 0.3, browLift: Math.max(c.browLift ?? 0, 0.25), gx: 0, gy: 0 })); return; }
    if (avState === "thinking") { setCues(c => ({ ...c, gx: -5, gy: -4, browLift: 0.3, lean: 0 })); return; }
    const p = perfRef.current;                       // speaking
    const base = EMO_BASE[p?.emotion ?? "neutral"] ?? EMO_BASE.neutral;
    const valence = p ? (p.valence - 0.5) * 0.4 : 0;
    setCues({ ...base, smile: (base.smile ?? 0) + valence, lean: p?.lean === "in" ? 0.5 : 0, breath: p?.breath ?? 0.4, gx: 0, gy: 0 });
    // gaze: periodic glances chosen by the plan, with tiny saccades while holding contact
    const GAZE: Record<string, [number, number]> = { away_think: [-6, -4], down_sincere: [0, 5], aside_recall: [7, 0] };
    const glance = () => {
      const g = GAZE[p?.gaze ?? "hold"];
      const v: [number, number] = g ?? [(Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2];
      setCues(c => ({ ...c, gx: v[0], gy: v[1] }));
      later(g ? 700 : 350, () => setCues(c => ({ ...c, gx: 0, gy: 0 })));
      later(1800 + Math.random() * 2600, glance);
    };
    later(900, glance);
    // nods: emphasis at the start, then occasionally, weighted by the plan
    const nodLoop = () => {
      if (Math.random() < (p?.nod ?? 0.3)) {
        setCues(c => ({ ...c, nod: 4 })); later(220, () => setCues(c => ({ ...c, nod: 0 })));
      }
      later(3000 + Math.random() * 2500, nodLoop);
    };
    later(450, nodLoop);
    // one micro-expression flash, never on consecutive replies
    if (p && p.micro !== "none" && p.micro_conf >= 0.6 && turnNo.current - microLast.current > 1) {
      microLast.current = turnNo.current;
      const FLASH: Record<string, Cues> = { brow_flash: { browLift: 1 }, brow_knit: { browKnit: 0.8 }, smile_flick: { smile: 0.9 }, lip_press: { smile: -0.4 } };
      later(600 + Math.random() * 500, () => {
        const f = FLASH[p.micro]; if (!f) return;
        setCues(c => ({ ...c, ...f })); later(230, () => setCues(c => ({ ...c, ...base, smile: (base.smile ?? 0) + valence })));
      });
    }
    // warm finish
    if (p?.smile_end >= 0.6) later(Math.max(2500, (pendingTextLen.current / 14) * 1000), () => setCues(c => ({ ...c, smile: Math.max(c.smile ?? 0, 0.7) })));
    return () => timers.forEach(clearTimeout);
  }, [avState]);   // eslint-disable-line react-hooks/exhaustive-deps

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
