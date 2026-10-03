/* @ds-bundle: {"format":4,"namespace":"KlardenUIDesignSystem_be9654","components":[{"name":"RichButton","sourcePath":"components/buttons/RichButton.jsx"},{"name":"LogoCarousel","sourcePath":"components/carousels/LogoCarousel.jsx"},{"name":"Accordion","sourcePath":"components/core/Accordion.jsx"},{"name":"LabelInput","sourcePath":"components/inputs/LabelInput.jsx"},{"name":"Slider","sourcePath":"components/inputs/Slider.jsx"},{"name":"MagneticDock","sourcePath":"components/navigation/MagneticDock.jsx"},{"name":"Pagination","sourcePath":"components/navigation/Pagination.jsx"},{"name":"NumberTicker","sourcePath":"components/typography/NumberTicker.jsx"},{"name":"ShimmerText","sourcePath":"components/typography/ShimmerText.jsx"},{"name":"TactileHighlight","sourcePath":"components/typography/TactileHighlight.jsx"}],"sourceHashes":{"components/buttons/RichButton.jsx":"e7f03a1ac028","components/carousels/LogoCarousel.jsx":"dcc3b631aca6","components/core/Accordion.jsx":"bad3fcacd9d0","components/inputs/LabelInput.jsx":"611fa804da90","components/inputs/Slider.jsx":"8efdc7019105","components/navigation/MagneticDock.jsx":"57c133e88284","components/navigation/Pagination.jsx":"b0d1a197d4b6","components/typography/NumberTicker.jsx":"bdd4b6ca48f1","components/typography/ShimmerText.jsx":"00421f835875","components/typography/TactileHighlight.jsx":"00ddd0f43e4d"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.KlardenUIDesignSystem_be9654 = window.KlardenUIDesignSystem_be9654 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/buttons/RichButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  useState
} = React;
const colorMap = {
  default: {
    bg: "var(--primary)",
    text: "var(--primary-foreground)",
    border: "var(--border)"
  },
  blue: {
    bg: "var(--accent-blue)",
    text: "#fff",
    border: "transparent"
  },
  purple: {
    bg: "var(--accent-purple)",
    text: "#fff",
    border: "transparent"
  },
  pink: {
    bg: "var(--accent-pink)",
    text: "#fff",
    border: "transparent"
  },
  red: {
    bg: "var(--accent-red)",
    text: "#fff",
    border: "transparent"
  },
  orange: {
    bg: "var(--accent-orange)",
    text: "#fff",
    border: "transparent"
  },
  yellow: {
    bg: "var(--accent-yellow)",
    text: "var(--zinc-950)",
    border: "transparent"
  },
  green: {
    bg: "var(--accent-green)",
    text: "#fff",
    border: "transparent"
  },
  teal: {
    bg: "var(--accent-teal)",
    text: "#fff",
    border: "transparent"
  },
  cyan: {
    bg: "var(--accent-cyan)",
    text: "var(--zinc-950)",
    border: "transparent"
  },
  indigo: {
    bg: "var(--accent-indigo)",
    text: "#fff",
    border: "transparent"
  },
  violet: {
    bg: "var(--accent-violet)",
    text: "#fff",
    border: "transparent"
  },
  rose: {
    bg: "var(--accent-rose)",
    text: "#fff",
    border: "transparent"
  },
  amber: {
    bg: "var(--accent-amber)",
    text: "#fff",
    border: "transparent"
  },
  lime: {
    bg: "var(--accent-lime)",
    text: "var(--zinc-950)",
    border: "transparent"
  },
  sky: {
    bg: "var(--accent-sky)",
    text: "#fff",
    border: "transparent"
  },
  emerald: {
    bg: "var(--accent-emerald)",
    text: "#fff",
    border: "transparent"
  },
  fuchsia: {
    bg: "var(--accent-fuchsia)",
    text: "#fff",
    border: "transparent"
  }
};
const sizeMap = {
  sm: {
    height: 36,
    padding: "0 16px",
    fontSize: "var(--text-xs)",
    gap: 8
  },
  default: {
    height: 44,
    padding: "0 24px",
    fontSize: "var(--text-sm)",
    gap: 10
  },
  lg: {
    height: 52,
    padding: "0 40px",
    fontSize: "1rem",
    gap: 12
  }
};
function RichButton({
  color = "default",
  size = "default",
  style,
  children,
  ...props
}) {
  const [hover, setHover] = useState(false);
  const [active, setActive] = useState(false);
  const c = colorMap[color] || colorMap.default;
  const s = sizeMap[size] || sizeMap.default;
  return /*#__PURE__*/React.createElement("button", _extends({
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => {
      setHover(false);
      setActive(false);
    },
    onMouseDown: () => setActive(true),
    onMouseUp: () => setActive(false)
  }, props, {
    style: {
      position: "relative",
      cursor: "pointer",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      border: `1px solid ${c.border}`,
      borderRadius: "var(--radius-2xl)",
      background: c.bg,
      color: c.text,
      height: s.height,
      padding: s.padding,
      fontSize: s.fontSize,
      gap: s.gap,
      fontWeight: 600,
      fontFamily: "var(--font-sans)",
      letterSpacing: "var(--tracking-tight)",
      boxShadow: "var(--shadow-md)",
      transition: "transform 200ms ease",
      transform: active ? "scale(0.95)" : hover ? "scale(1.02)" : "scale(1)",
      ...style
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      position: "relative",
      zIndex: 1,
      display: "flex",
      alignItems: "center"
    }
  }, children), /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      inset: 0,
      background: "linear-gradient(to bottom, rgba(255,255,255,0.2), transparent)",
      opacity: 0.4,
      pointerEvents: "none"
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      insetInline: 0,
      top: 0,
      height: 1,
      background: "rgba(255,255,255,0.3)",
      pointerEvents: "none"
    }
  }));
}
Object.assign(__ds_scope, { RichButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/buttons/RichButton.jsx", error: String((e && e.message) || e) }); }

// components/carousels/LogoCarousel.jsx
try { (() => {
const {
  Children,
  Fragment
} = React;
function LogoCarousel({
  children,
  duration = 20,
  direction = "left",
  gap = "3rem",
  fade = true
}) {
  const animName = direction === "left" ? "logo-carousel" : "logo-carousel-reverse";
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      width: "100%",
      overflow: "hidden",
      maskImage: fade ? "linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)" : undefined,
      WebkitMaskImage: fade ? "linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)" : undefined
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap,
      flexShrink: 0,
      minWidth: "100%",
      animation: `${animName} ${duration}s linear infinite`,
      "--gap": gap
    }
  }, [0, 1].map(i => /*#__PURE__*/React.createElement(Fragment, {
    key: i
  }, Children.map(children, (child, idx) => /*#__PURE__*/React.createElement("div", {
    key: idx,
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0
    }
  }, child))))));
}
Object.assign(__ds_scope, { LogoCarousel });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/carousels/LogoCarousel.jsx", error: String((e && e.message) || e) }); }

// components/core/Accordion.jsx
try { (() => {
const {
  useState
} = React;
function Item({
  item,
  isOpen,
  onToggle
}) {
  const [hover, setHover] = useState(false);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      borderBottom: "1px solid var(--border)",
      background: isOpen ? "var(--muted)" : "transparent",
      transition: "background 300ms ease"
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onToggle,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      position: "relative",
      display: "flex",
      width: "100%",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "20px 16px 20px 20px",
      textAlign: "left",
      fontWeight: 600,
      fontSize: "var(--text-base)",
      color: isOpen || hover ? "var(--foreground)" : "var(--muted-foreground)",
      background: "none",
      border: "none",
      cursor: "pointer",
      fontFamily: "var(--font-sans)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      left: 0,
      top: "50%",
      height: isOpen ? "75%" : 0,
      width: 3,
      transform: "translateY(-50%)",
      background: "var(--foreground)",
      transition: "height 300ms ease"
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      transform: hover ? "translateX(4px)" : "translateX(0)",
      transition: "transform 200ms ease"
    }
  }, item.trigger), /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: {
      transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
      transition: "transform 500ms ease",
      color: "var(--muted-foreground)",
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("polyline", {
    points: "6 9 12 15 18 9"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      maxHeight: isOpen ? 400 : 0,
      overflow: "hidden",
      transition: "max-height 300ms ease"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "4px 20px 24px 20px",
      fontSize: "var(--text-base)",
      lineHeight: "var(--leading-relaxed)",
      color: "var(--muted-foreground)"
    }
  }, item.content)));
}
function Accordion({
  items,
  type = "single",
  defaultOpen = []
}) {
  const [open, setOpen] = useState(new Set(defaultOpen));
  const toggle = value => {
    setOpen(prev => {
      const next = type === "single" ? new Set() : new Set(prev);
      if (!prev.has(value)) next.add(value);
      return next;
    });
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: "100%",
      borderTop: "1px solid var(--border)"
    }
  }, items.map(item => /*#__PURE__*/React.createElement(Item, {
    key: item.value,
    item: item,
    isOpen: open.has(item.value),
    onToggle: () => toggle(item.value)
  })));
}
Object.assign(__ds_scope, { Accordion });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Accordion.jsx", error: String((e && e.message) || e) }); }

// components/inputs/LabelInput.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  useState
} = React;
const ringMap = {
  muted: "var(--muted-foreground)",
  primary: "var(--primary)",
  red: "var(--accent-red)",
  blue: "var(--accent-blue)",
  green: "var(--accent-green)",
  yellow: "var(--accent-yellow)",
  purple: "var(--accent-purple)",
  pink: "var(--accent-pink)",
  orange: "var(--accent-orange)",
  cyan: "var(--accent-cyan)",
  indigo: "var(--accent-indigo)",
  violet: "var(--accent-violet)",
  rose: "var(--accent-rose)",
  amber: "var(--accent-amber)",
  lime: "var(--accent-lime)",
  emerald: "var(--accent-emerald)",
  sky: "var(--accent-sky)",
  fuchsia: "var(--accent-fuchsia)"
};
function LabelInput({
  label = "",
  ringColor = "muted",
  type = "text",
  placeholder = "",
  onFocus,
  onBlur,
  onChange,
  ...props
}) {
  const [focused, setFocused] = useState(false);
  const [hasValue, setHasValue] = useState(false);
  const [visible, setVisible] = useState(false);
  const isPassword = type === "password";
  const showLabel = focused || hasValue || !placeholder;
  const ring = ringMap[ringColor] || ringMap.muted;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      width: "100%"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      display: "flex",
      alignItems: "center",
      borderRadius: "var(--radius-lg)",
      border: `1px solid ${focused ? ring : "var(--input)"}`,
      boxShadow: focused ? `0 0 0 3px ${ring}33` : "none",
      transition: "all 200ms ease"
    }
  }, showLabel && label && /*#__PURE__*/React.createElement("label", {
    style: {
      position: "absolute",
      left: 12,
      top: 0,
      transform: "translateY(-50%)",
      padding: "0 4px",
      fontSize: "var(--text-xs)",
      fontWeight: 500,
      background: "var(--background)",
      color: "var(--muted-foreground)",
      pointerEvents: "none"
    }
  }, label), /*#__PURE__*/React.createElement("input", _extends({
    type: isPassword && visible ? "text" : type,
    placeholder: showLabel ? undefined : placeholder,
    onFocus: e => {
      setFocused(true);
      onFocus?.(e);
    },
    onBlur: e => {
      setFocused(false);
      setHasValue(e.target.value !== "");
      onBlur?.(e);
    },
    onChange: e => {
      setHasValue(e.target.value !== "");
      onChange?.(e);
    },
    style: {
      width: "100%",
      background: "transparent",
      border: "none",
      outline: "none",
      padding: "10px 12px",
      fontSize: "var(--text-base)",
      color: "var(--foreground)",
      paddingRight: isPassword ? 40 : 12,
      fontFamily: "var(--font-sans)"
    }
  }, props)), isPassword && /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setVisible(v => !v),
    style: {
      position: "absolute",
      right: 8,
      top: "50%",
      transform: "translateY(-50%)",
      border: "none",
      background: "none",
      cursor: "pointer",
      color: "var(--muted-foreground)",
      padding: 6
    }
  }, visible ? /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M9.88 9.88a3 3 0 1 0 4.24 4.24"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "2",
    y1: "2",
    x2: "22",
    y2: "22"
  })) : /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "3"
  })))));
}
Object.assign(__ds_scope, { LabelInput });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/inputs/LabelInput.jsx", error: String((e && e.message) || e) }); }

// components/inputs/Slider.jsx
try { (() => {
const {
  useCallback,
  useRef,
  useState
} = React;
const colorMap = {
  default: "var(--foreground)",
  blue: "var(--accent-blue)",
  purple: "var(--accent-purple)",
  pink: "var(--accent-pink)",
  red: "var(--accent-red)",
  orange: "var(--accent-orange)",
  green: "var(--accent-green)",
  teal: "var(--accent-teal)",
  cyan: "var(--accent-cyan)",
  indigo: "var(--accent-indigo)",
  violet: "var(--accent-violet)",
  rose: "var(--accent-rose)",
  amber: "var(--accent-amber)",
  lime: "var(--accent-lime)",
  sky: "var(--accent-sky)",
  emerald: "var(--accent-emerald)",
  fuchsia: "var(--accent-fuchsia)"
};
function formatTime(seconds) {
  const abs = Math.abs(seconds);
  const h = Math.floor(abs / 3600),
    m = Math.floor(abs % 3600 / 60),
    s = Math.floor(abs % 60);
  const str = [m, s].map(v => String(v).padStart(2, "0")).join(":");
  return h > 0 ? `${h}:${str}` : str;
}
const thumbShape = {
  circle: "50%",
  square: "0",
  diamond: "2px",
  rounded: "6px",
  line: "9999px"
};
function Slider({
  value,
  max,
  onValueChange,
  onValueCommit,
  showRemaining = true,
  color = "default",
  thumb = "circle",
  disabled = false
}) {
  const trackRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [hovering, setHovering] = useState(false);
  const clamped = Math.max(0, Math.min(value, max));
  const pct = max > 0 ? clamped / max * 100 : 0;
  const remaining = max - clamped;
  const fill = colorMap[color] || colorMap.default;
  const valueFromX = useCallback(clientX => {
    if (!trackRef.current) return 0;
    const rect = trackRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    return Math.round(x / rect.width * max);
  }, [max]);
  const isLine = thumb === "line";
  const size = isLine ? {
    width: 4,
    height: 20
  } : {
    width: 16,
    height: 16
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: "100%",
      display: "flex",
      flexDirection: "column",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    ref: trackRef,
    onPointerDown: e => {
      if (disabled) return;
      setDragging(true);
      onValueChange?.(valueFromX(e.clientX));
    },
    onPointerMove: e => dragging && !disabled && onValueChange?.(valueFromX(e.clientX)),
    onPointerUp: e => {
      if (!dragging) return;
      setDragging(false);
      onValueCommit?.(valueFromX(e.clientX));
    },
    onMouseEnter: () => setHovering(true),
    onMouseLeave: () => setHovering(false),
    style: {
      position: "relative",
      height: 20,
      display: "flex",
      alignItems: "center",
      cursor: disabled ? "default" : "pointer",
      touchAction: "none"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      height: 4,
      width: "100%",
      borderRadius: 9999,
      background: "var(--muted)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      inset: 0,
      right: `${100 - pct}%`,
      borderRadius: 9999,
      background: fill,
      transition: "width 75ms ease"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: "50%",
      left: `${pct}%`,
      transform: `translate(-50%, -50%) scale(${dragging ? 1.25 : hovering ? 1.1 : 0})`,
      transition: "transform 150ms ease",
      width: size.width,
      height: size.height,
      borderRadius: thumbShape[thumb],
      background: fill,
      rotate: thumb === "diamond" ? "45deg" : "0deg"
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      fontFamily: "var(--font-mono)",
      fontSize: "var(--text-xs)",
      color: "var(--muted-foreground)"
    }
  }, /*#__PURE__*/React.createElement("span", null, formatTime(clamped)), /*#__PURE__*/React.createElement("span", null, showRemaining ? `-${formatTime(remaining)}` : formatTime(max))));
}
Object.assign(__ds_scope, { Slider });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/inputs/Slider.jsx", error: String((e && e.message) || e) }); }

// components/navigation/MagneticDock.jsx
try { (() => {
const {
  useRef,
  useState
} = React;
function DockIcon({
  mouseX,
  item,
  distance,
  magnification
}) {
  const ref = useRef(null);
  const [size, setSize] = useState(40);
  const [hover, setHover] = useState(false);
  React.useEffect(() => {
    const update = () => {
      if (!ref.current) return;
      const bounds = ref.current.getBoundingClientRect();
      const d = mouseX.current - bounds.left - bounds.width / 2;
      let target = 40;
      if (Math.abs(d) < distance) {
        const t = 1 - Math.abs(d) / distance;
        target = 40 + (magnification - 40) * t;
      }
      setSize(prev => prev + (target - prev) * 0.35);
    };
    const id = setInterval(update, 16);
    return () => clearInterval(id);
  }, [mouseX, distance, magnification]);
  return /*#__PURE__*/React.createElement("div", {
    ref: ref,
    onClick: item.onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      width: size,
      height: size,
      borderRadius: "50%",
      background: "var(--card)",
      border: "1px solid var(--border)",
      boxShadow: "var(--shadow-md)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
      cursor: "pointer",
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: size * 0.45,
      height: size * 0.45,
      color: "var(--muted-foreground)"
    }
  }, item.icon), hover && /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      bottom: "calc(100% + 10px)",
      left: "50%",
      transform: "translateX(-50%)",
      padding: "4px 8px",
      background: "var(--primary)",
      color: "var(--primary-foreground)",
      fontSize: 9,
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.1em",
      borderRadius: "var(--radius-md)",
      whiteSpace: "nowrap",
      pointerEvents: "none"
    }
  }, item.label));
}
const icon = d => /*#__PURE__*/React.createElement("svg", {
  width: "100%",
  height: "100%",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round"
}, d);
const defaultItems = [{
  label: "Apps",
  icon: icon(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
    x: "3",
    y: "3",
    width: "7",
    height: "7",
    rx: "1"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "14",
    y: "3",
    width: "7",
    height: "7",
    rx: "1"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "3",
    y: "14",
    width: "7",
    height: "7",
    rx: "1"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "14",
    y: "14",
    width: "7",
    height: "7",
    rx: "1"
  })))
}, {
  label: "Explore",
  icon: icon(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "10"
  }), /*#__PURE__*/React.createElement("polygon", {
    points: "16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"
  })))
}, {
  label: "Assistant",
  icon: icon(/*#__PURE__*/React.createElement("path", {
    d: "M12 3l1.8 4.8L18.6 9.6 13.8 11.4 12 16.2l-1.8-4.8L5.4 9.6l4.8-1.8L12 3z"
  }))
}, {
  label: "Chat",
  icon: icon(/*#__PURE__*/React.createElement("path", {
    d: "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
  }))
}, {
  label: "Files",
  icon: icon(/*#__PURE__*/React.createElement("path", {
    d: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
  }))
}, {
  label: "Settings",
  icon: icon(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "3"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
  })))
}];
function MagneticDock({
  items = defaultItems,
  distance = 140,
  magnification = 70
}) {
  const mouseX = useRef(Infinity);
  return /*#__PURE__*/React.createElement("div", {
    onMouseMove: e => {
      mouseX.current = e.clientX;
    },
    onMouseLeave: () => {
      mouseX.current = Infinity;
    },
    style: {
      display: "flex",
      alignItems: "flex-end",
      gap: 10,
      borderRadius: "var(--radius-2xl)",
      background: "color-mix(in oklch, var(--card) 80%, transparent)",
      backdropFilter: "blur(20px)",
      border: "1px solid var(--border)",
      padding: "10px 14px",
      boxShadow: "var(--shadow-lg)",
      width: "fit-content"
    }
  }, items.map((item, i) => /*#__PURE__*/React.createElement(DockIcon, {
    key: i,
    mouseX: mouseX,
    item: item,
    distance: distance,
    magnification: magnification
  })));
}
Object.assign(__ds_scope, { MagneticDock });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/MagneticDock.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Pagination.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  useState
} = React;
const colorMap = {
  default: "var(--primary)",
  blue: "var(--accent-blue)",
  purple: "var(--accent-purple)",
  pink: "var(--accent-pink)",
  red: "var(--accent-red)",
  orange: "var(--accent-orange)",
  green: "var(--accent-green)",
  teal: "var(--accent-teal)",
  cyan: "var(--accent-cyan)",
  indigo: "var(--accent-indigo)",
  violet: "var(--accent-violet)",
  rose: "var(--accent-rose)",
  amber: "var(--accent-amber)",
  lime: "var(--accent-lime)",
  sky: "var(--accent-sky)",
  emerald: "var(--accent-emerald)",
  fuchsia: "var(--accent-fuchsia)"
};
const sizeMap = {
  sm: 32,
  md: 40,
  lg: 48
};
function pageList(total, current, siblingCount) {
  const totalNumbers = siblingCount * 2 + 3,
    totalBlocks = totalNumbers + 2;
  if (total <= totalBlocks) return Array.from({
    length: total
  }, (_, i) => i + 1);
  const left = Math.max(current - siblingCount, 1),
    right = Math.min(current + siblingCount, total);
  const items = [];
  if (left > 2) items.push(1, "…s");else if (left > 1) items.push(1);
  for (let i = left; i <= right; i++) items.push(i);
  if (right < total - 1) items.push("…e", total);else if (right < total) items.push(total);
  return items;
}
function Btn({
  children,
  onClick,
  disabled,
  active,
  color,
  size,
  variant,
  ...rest
}) {
  const [hover, setHover] = useState(false);
  return /*#__PURE__*/React.createElement("button", _extends({
    onClick: onClick,
    disabled: disabled,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: sizeMap[size],
      minWidth: sizeMap[size],
      borderRadius: variant === "squircle" ? "var(--radius-xl)" : "var(--radius-lg)",
      border: active ? `2px solid ${color}` : variant === "outline" ? "1px solid var(--border)" : "1px solid transparent",
      background: active ? color : hover && !disabled ? "var(--muted)" : "transparent",
      color: active ? "#fff" : "var(--muted-foreground)",
      fontWeight: 500,
      fontSize: "var(--text-sm)",
      fontFamily: "var(--font-sans)",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.4 : 1,
      transition: "all 150ms ease"
    }
  }, rest), children);
}
function Pagination({
  totalPages,
  currentPage,
  onPageChange,
  siblingCount = 1,
  color = "default",
  variant = "solid",
  showEdges = false,
  size = "md"
}) {
  if (totalPages <= 1) return null;
  const pages = pageList(totalPages, currentPage, siblingCount);
  const c = colorMap[color] || colorMap.default;
  const go = p => p >= 1 && p <= totalPages && p !== currentPage && onPageChange(p);
  const chevron = d => /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("polyline", {
    points: d === "l" ? "15 18 9 12 15 6" : "9 18 15 12 9 6"
  }));
  return /*#__PURE__*/React.createElement("nav", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6
    }
  }, showEdges && /*#__PURE__*/React.createElement(Btn, {
    onClick: () => go(1),
    disabled: currentPage === 1,
    color: c,
    size: size,
    variant: variant
  }, "\xAB"), /*#__PURE__*/React.createElement(Btn, {
    onClick: () => go(currentPage - 1),
    disabled: currentPage === 1,
    color: c,
    size: size,
    variant: variant
  }, chevron("l")), pages.map((p, i) => typeof p === "string" ? /*#__PURE__*/React.createElement("span", {
    key: p + i,
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: sizeMap[size],
      minWidth: sizeMap[size],
      color: "var(--muted-foreground)",
      gap: 3
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 3,
      height: 3,
      borderRadius: "50%",
      background: "currentColor"
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 3,
      height: 3,
      borderRadius: "50%",
      background: "currentColor"
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 3,
      height: 3,
      borderRadius: "50%",
      background: "currentColor"
    }
  })) : /*#__PURE__*/React.createElement(Btn, {
    key: p,
    onClick: () => go(p),
    active: p === currentPage,
    color: c,
    size: size,
    variant: variant
  }, p)), /*#__PURE__*/React.createElement(Btn, {
    onClick: () => go(currentPage + 1),
    disabled: currentPage === totalPages,
    color: c,
    size: size,
    variant: variant
  }, chevron("r")), showEdges && /*#__PURE__*/React.createElement(Btn, {
    onClick: () => go(totalPages),
    disabled: currentPage === totalPages,
    color: c,
    size: size,
    variant: variant
  }, "\xBB"));
}
Object.assign(__ds_scope, { Pagination });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Pagination.jsx", error: String((e && e.message) || e) }); }

// components/typography/NumberTicker.jsx
try { (() => {
const {
  useEffect,
  useRef,
  useState
} = React;
function NumberTicker({
  from = 0,
  target = 100,
  duration = 2,
  style
}) {
  const [value, setValue] = useState(from);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    const obs = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      obs.disconnect();
      const start = performance.now();
      const step = now => {
        const t = Math.min(1, (now - start) / (duration * 1000));
        const eased = 1 - Math.pow(1 - t, 3);
        setValue(Math.round(from + (target - from) * eased));
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, {
      threshold: 0.4
    });
    if (el) obs.observe(el);
    return () => obs.disconnect();
  }, [from, target, duration]);
  return /*#__PURE__*/React.createElement("span", {
    ref: ref,
    style: {
      fontFamily: "var(--font-mono)",
      fontWeight: 600,
      ...style
    }
  }, value);
}
Object.assign(__ds_scope, { NumberTicker });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/typography/NumberTicker.jsx", error: String((e && e.message) || e) }); }

// components/typography/ShimmerText.jsx
try { (() => {
const variantColors = {
  default: ["#60a5fa", "#3b82f6"],
  blue: ["#60a5fa", "#3b82f6"],
  purple: ["#a855f7", "#7c3aed"],
  green: ["#22c55e", "#16a34a"],
  red: ["#ef4444", "#dc2626"],
  amber: ["#f59e0b", "#d97706"],
  gold: ["#fbbf24", "#f59e0b"],
  silver: ["#e4e4e7", "#a1a1aa"],
  rose: ["#f43f5e", "#e11d48"],
  cyan: ["#06b6d4", "#0891b2"],
  indigo: ["#6366f1", "#4f46e5"],
  lime: ["#84cc16", "#65a30d"],
  orange: ["#f97316", "#ea580c"],
  pink: ["#ec4899", "#db2777"],
  teal: ["#14b8a6", "#0d9488"],
  violet: ["#8b5cf6", "#7c3aed"]
};
function ShimmerText({
  children,
  variant = "default",
  direction = "rtl",
  duration = 2
}) {
  const [c1, c2] = variantColors[variant] || variantColors.default;
  const bgSize = 150;
  const id = React.useId().replace(/[:]/g, "");
  const start = direction === "ltr" ? -bgSize : bgSize;
  const end = direction === "ltr" ? bgSize : -bgSize;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-block",
      fontWeight: 700,
      backgroundImage: `linear-gradient(90deg, #52525b 0%, ${c1} 40%, ${c2} 50%, ${c1} 60%, #52525b 100%)`,
      backgroundSize: `${bgSize}% 100%`,
      color: "transparent",
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      animation: `shimmer-${id} ${duration}s linear infinite`
    }
  }, /*#__PURE__*/React.createElement("style", null, `@keyframes shimmer-${id}{from{background-position:${start}% 0}to{background-position:${end}% 0}}`), children);
}
Object.assign(__ds_scope, { ShimmerText });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/typography/ShimmerText.jsx", error: String((e && e.message) || e) }); }

// components/typography/TactileHighlight.jsx
try { (() => {
const {
  useEffect,
  useRef,
  useState
} = React;
function TactileHighlight({
  children,
  direction = "left",
  delay = 0.1
}) {
  const [visible, setVisible] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    const obs = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      threshold: 0.4
    });
    if (el) obs.observe(el);
    return () => obs.disconnect();
  }, []);
  const originMap = {
    left: "0% 50%",
    right: "100% 50%",
    top: "50% 0%",
    bottom: "50% 100%"
  };
  const isX = direction === "left" || direction === "right";
  return /*#__PURE__*/React.createElement("span", {
    ref: ref,
    style: {
      position: "relative",
      display: "inline-block",
      whiteSpace: "nowrap",
      padding: "0 0.15em",
      margin: "0 -0.15em"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      inset: 0,
      zIndex: 0,
      background: "var(--foreground)",
      transformOrigin: originMap[direction],
      borderRadius: visible ? 4 : 12,
      transform: visible ? "scale(1,1)" : `scale(${isX ? 0 : 1}, ${isX ? 1 : 0})`,
      transition: `transform 500ms cubic-bezier(0.34,1.56,0.64,1) ${delay}s, border-radius 500ms ease ${delay}s`
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      position: "relative",
      zIndex: 1,
      color: "#fff",
      mixBlendMode: "difference",
      pointerEvents: "none"
    }
  }, children));
}
Object.assign(__ds_scope, { TactileHighlight });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/typography/TactileHighlight.jsx", error: String((e && e.message) || e) }); }

__ds_ns.RichButton = __ds_scope.RichButton;

__ds_ns.LogoCarousel = __ds_scope.LogoCarousel;

__ds_ns.Accordion = __ds_scope.Accordion;

__ds_ns.LabelInput = __ds_scope.LabelInput;

__ds_ns.Slider = __ds_scope.Slider;

__ds_ns.MagneticDock = __ds_scope.MagneticDock;

__ds_ns.Pagination = __ds_scope.Pagination;

__ds_ns.NumberTicker = __ds_scope.NumberTicker;

__ds_ns.ShimmerText = __ds_scope.ShimmerText;

__ds_ns.TactileHighlight = __ds_scope.TactileHighlight;

})();
