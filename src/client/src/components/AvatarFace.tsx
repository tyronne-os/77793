type AvatarState = "idle" | "listening" | "thinking" | "speaking";


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
