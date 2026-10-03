# Klarden UI — Design System

A monochrome, physics-driven component design system rebuilt from **[Klarden UI](https://klarden.vercel.app)** ([`dev-o-los/klarden-ui`](https://github.com/dev-o-los/klarden-ui), mirrored here as `tyronne-os/klarden-ui`) — an open-source, shadcn-registry-style library of animated React components "for design engineers." Explore the source repo directly for the full 26-component catalog, live demos, and MDX docs this system was distilled from.

## What Klarden UI is

Klarden UI ships no npm package — components are copy-pasted into a consumer's own codebase via a shadcn-style CLI registry (`npx shadcn add https://klarden.vercel.app/r/<name>.json`). The product is a single Next.js 16 / React 19 site: a marketing homepage, a docs site (MDX, `/docs/...`), and the registry JSON endpoints behind it. There is one audience (design engineers wiring up interfaces) and one surface (the docs/marketing site) — no separate mobile app or dashboard.

The whole catalog spans 21 "UI" components (buttons, inputs, navigation, cards, carousels, typography effects) plus 5 WebGL background shaders. This design system ports a representative slice — one per category, chosen for portability without a build step — as plain inline-styled React; the rest remain documented in the source repo for anyone with access to go further.

## Sources

- Component source & registry: https://github.com/dev-o-los/klarden-ui (mirror read: `tyronne-os/klarden-ui`, branch `master`)
- Live site: https://klarden.vercel.app · Docs: https://klarden.vercel.app/docs/introduction
- Author: [dev-o-los](https://github.com/dev-o-los)

If you have access to the repo, go read `registry/klarden-ui/*.tsx` for the full, unabridged component implementations (Framer Motion springs, WebGL shaders, opentype.js signature rendering) — what's here is a faithful but simplified port for HTML/inline-style prototyping.

## Index

- `styles.css` — the one stylesheet to link. Imports everything under `tokens/`.
- `tokens/` — `colors.css`, `typography.css`, `spacing.css` (spacing, radius, shadow scale).
- `assets/logo.svg` — the Klarden mark. `assets/icons/` — social brand icons. `assets/logos/` — 16 third-party brand logos used in the footer's social-proof ticker.
- `components/` — reusable primitives, grouped by concern (see below).
- `guidelines/` — foundation specimen cards (colors, type, spacing, radius, shadows, brand).
- `ui_kits/marketing-site/` — an interactive recreation of the Klarden homepage.
- `SKILL.md` — Claude Code / Agent Skill wrapper for this whole folder.

## Components

Ten of the source's 26 registry components, ported as dependency-free React (inline styles + this system's CSS variables — no Tailwind, no Framer Motion, no npm):

- **Buttons**: `RichButton` — tactile CTA, 18 colors, hover-sheen sweep.
- **Inputs**: `LabelInput` — floating-label text/password input. `Slider` — media-progress slider.
- **Core**: `Accordion` — bordered accordion, magnetic-hover trigger text.
- **Navigation**: `Pagination` — numbered pagination with ellipsis collapsing. `MagneticDock` — macOS-style proximity-magnified icon dock.
- **Typography**: `ShimmerText` — looping color sweep clipped to text. `TactileHighlight` — spring-in highlight block (`mix-blend-difference`). `NumberTicker` — animated counting number.
- **Carousels**: `LogoCarousel` — infinite-scroll, fade-masked logo/brand row.

### Intentional additions
None — every component above has a direct 1:1 counterpart in the source registry (same name, same prop surface, simplified implementation). Nothing was invented.

### Not yet ported
`BoxCarousel`, `CommandOrbit`, `ImageTrail`, `MacTerminal`, `OrbitContextMenu`, `PageNotFound`, `PortalUploader`, `QrCode`, `Signature`, `Pagination`'s sibling color-picker demos, and all 5 WebGL backgrounds (`AnimatedGradient`, `GhostEther`, `PlasmaWave`, `RnaLines`, `StarrySky`) — these depend on WebGL shaders, `opentype.js`, or Framer Motion's physics engine in ways that don't translate to a build-step-free inline-styled port. They're fully documented in the source repo if you need them.

## Content fundamentals

Klarden UI's copy is **short, declarative, and feature-first** — it describes what a component does in one clause, then stops:
> "Physics-based accordion with spring animations and magnetic text hover effects"
> "Cinematic blur-to-sharp content/text reveal animation on mount"

- **Voice**: third person, no "you"/"I" — copy describes the *product*, not the reader ("Klarden UI is a free, open-source collection…"). CTAs are the exception and use direct imperatives ("Get Started").
- **Tone**: confident, technical, unembellished. No hype adjectives beyond "premium" and "refined," used sparingly as category labels, not sales language.
- **Casing**: sentence case in body copy and docs; UPPERCASE + wide letter-spacing reserved for tiny UI chrome (nav labels, the hero's pill badge "CURATED FOR DESIGN ENGINEERS").
- **Vibe**: engineer-to-engineer. Feature checklists use ✅ + bold lead term ("**Physics-based** — spring animations via Framer Motion (not duration-fixed CSS transitions)").
- **Emoji**: used only as functional checklist bullets (✅) and section-heading markers in the README (🚀 🧩 🛠 📁 🤝 🔍 📄) — never inline in sentences or UI copy.
- **Pronouns**: the docs occasionally address the reader directly in instructional contexts ("Your project needs these dependencies"), but marketing copy stays third-person.

## Visual foundations

- **Palette**: strictly monochrome (zinc/oklch grayscale) for every structural surface — background, card, border, text. Color exists only as an *optional variant* on interactive components (buttons, sliders, pagination, inputs) — never as a default or a background wash. 17–18 accent hues are offered per colorable component, all mid-saturation Tailwind-style hues (blue, purple, emerald, rose, amber…), applied one at a time, never combined into a gradient.
- **No gradients on structural surfaces.** The only gradients in the source are: a subtle white-to-transparent sheen inside buttons (`from-white/20 to-transparent`), a shimmer sweep inside `ShimmerText`, and the WebGL background shaders (a separate, opt-in decorative layer, not the default canvas).
- **Type**: Geist Sans (UI/body) + Geist Mono (numerals, timestamps, code, telemetry-style readouts, always `tabular-nums`). One italic serif accent line breaks up the sans-heavy hero headline ("modern interfaces") — system serif, used exactly once as a rhetorical device, not a real typeface commitment.
- **Backgrounds**: flat color only. No photography, no hand-drawn illustration, no repeating pattern/texture on the base UI. The WebGL shader components (Ghost Ether, Plasma Wave, Starry Sky, RNA Lines, Animated Gradient) are the *only* place organic/animated backgrounds appear, and they're opt-in decorative components, not page chrome.
- **Animation**: physics springs, not fixed-duration eases — explicitly a design principle ("Physics-based… not duration-fixed CSS transitions"). Typical spring: `damping 22–28, stiffness 130–400, mass 0.5–0.8`. Entrances fade+rise (`opacity 0→1, y 10→0`). Loops (shimmer, marquees) are the exception and run linear/infinite.
- **Hover states**: scale up slightly (`scale-1.02` to `1.05`), never a color-darken/lighten shift alone. Text nudges up to 4px toward the cursor ("magnetic" hover) on accordion triggers.
- **Press states**: scale down (`active:scale-95`) — no color change, no shadow removal.
- **Borders**: hairline, low-contrast (`border-zinc-200` light / `border-white/8` dark). Buttons/pills always carry a 1px border even when filled with an accent color.
- **Shadows**: soft and low-opacity black only — no colored glows, no colored ambient shadow, even on colored buttons (`shadow-blue-500/20` is the sole exception, used sparingly on filled accent buttons, not neutrals).
- **Corner radii**: one base token (`0.75rem`) multiplied out to a 7-step scale (`sm` 0.6× → `3xl` 2.2×). Pills/badges/dots use full round; cards typically `xl`–`2xl`; small controls (inputs, list rows) `lg`.
- **Cards**: 1px hairline border, flat background matching `--card`, soft `shadow-md`/`shadow-lg`, no colored left-border accent, no gradient fill.
- **Transparency/blur**: `backdrop-blur` used specifically for sticky/floating chrome that sits over content — the sticky navbar (`bg-background/80 backdrop-blur-xl`) and the magnetic dock (`bg-white/80 backdrop-blur-xl`). Not used on static content cards.
- **Layout**: single sticky top navbar; content in a `max-w-350` (≈1400px) centered column; no other fixed/pinned elements. Docs pages add a fixed left sidebar + right table-of-contents, both scrollable independently of the main column.
- **Imagery color vibe**: N/A — the source ships no photography; the only imagery is grayscale-filtered SVG brand logos (`filter: grayscale(1) opacity(.45–.6)`) in the social-proof ticker, and those invert (`filter: invert(1)`) between light/dark mode.

## Iconography

- **Functional icons** (chevrons, eye/eye-off, arrows, settings gear, folder, etc.): **Lucide** (`lucide-react`), used at 14–20px, `stroke-width: 2`, `currentColor` — never filled. This is a direct npm dependency of the source; consumers should link the [Lucide CDN](https://unpkg.com/lucide@latest) or install `lucide-react`.
- **Brand/social icons** (GitHub, X/Twitter, Threads): custom-drawn, Tabler-style stroke icons (same 24×24 viewBox, `stroke-width 2`, rounded caps) with their own hover micro-animation (scale + rotate wiggle on hover, done with Framer Motion in source; ported here as static SVGs in `assets/icons/`). Copied faithfully from `components/ui/*-icon.tsx`.
- **No emoji-as-icon, no unicode-symbol icons** anywhere in the product UI. The README's use of emoji as section markers is a GitHub-flavored-markdown convention, not a UI pattern.
- **No custom icon font.** Everything is inline SVG (Lucide) or hand-authored stroke SVG (brand icons).
- Third-party **brand logos** (Vercel, Linear, Notion, Framer, Discord, Shopify, OpenAI, Netflix, Google, Tesla, Ramp, Ramp, Phantom, OpenSea, Cursor, Descript, Duolingo) are real SVG wordmarks/logomarks, copied into `assets/logos/` — shown grayscale + dimmed in the footer's social-proof carousel, full color never used.

## Brand mark

`assets/logo.svg` — an abstract folded/origami-style monogram (four angular paper-fold shapes), rendered in `currentColor` so it flips black↔white with the theme. This **is** Klarden UI's real logo (copied from `public/logo.svg` in source) — not a placeholder.

## Fonts

**Geist** and **Geist Mono** (Vercel's typeface) — the source loads them via `next/font/google`. Both are on Google Fonts natively (added Oct 2024), so `tokens/typography.css` loads them with a standard Google Fonts `@import` — no substitution needed, no missing-font caveat.

One additional source font, `Tomatoes-O8L8.ttf` (a handwriting/script face used only by the `Signature` component, which draws SVG paths via `opentype.js`), was **not** ported — `Signature` itself is out of scope for this pass, so the font file was skipped rather than copied unused.
