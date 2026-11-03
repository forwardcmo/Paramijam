# Paramify Design System

A design system extracted from Paramify's "Coast Guard Presentation" Figma reference deck — a sales/solution-overview deck framed as **"A Compliance Operating Platform Built for Coast Guard Mission Success."** Paramify positions itself as software for federal RMF, SSP, and POA&M operations: a platform that runs the work, not just stores documents.

This system covers the **brand presentation surface**: slide decks, sales material, and UI mock fragments shown inside slides (dashboards, tables, integration cards). The reference file does **not** include a marketing site or the production app codebase, so those surfaces are out of scope here.

## Sources

- **Figma — "Claude Slide References.fig"** — mounted as a virtual filesystem; primary source of truth.
  - `/Page-1/Coast-Guard-Presentation/` — main deck, 19,700×1,080 (≈10 slides at 1920×1080)
  - `/Page-1/Timeline/` — "Why Paramify Over the Competition" comparison-table slide
  - `/Page-1/Timeline2/` — "Generate Required 20x Deliverables" outputs slide
  - `/Page-1/Draft/` — empty draft frame
- **Uploaded logo PNGs** in `uploads/` — three lockup variants (blue on transparent, black on transparent, blue on white).

No app codebase, marketing site, or written brand guide was provided. Voice/tone, visual foundations, and iconography below are inferred from in-deck copy and design choices. Flag anything that contradicts internal guidance.

## Index

- `README.md` — this file (context, content fundamentals, visual foundations, iconography)
- `colors_and_type.css` — all design tokens (color, type, spacing, radius, shadow) as CSS custom properties + base element styles
- `fonts/` — `@font-face` declarations and Google-Fonts-substituted webfonts (see "Type" below)
- `assets/` — logos, marks, and extracted SVG glyphs from the deck
- `preview/` — small HTML cards that render in the **Design System** tab
- `slides/` — sample slide layouts (title, section, content, comparison, big-quote) recreating the reference deck
- `SKILL.md` — agent skill manifest (so this folder also works as a Claude Code Skill)

There is no `ui_kits/` directory — the source material is a deck, not a product UI. The dashboard and table fragments shown inside slides are recreated as part of `slides/`.

---

## Content Fundamentals

**Voice.** Confident, factual, mission-aware. Speaks to federal compliance operators (DoD, Coast Guard, FedRAMP) — not consumers. Assumes the reader knows what RMF, SSP, POA&M, eMASS, ConMon, OKTA SAML, FIPS-validated YubiKeys, NIPRNet BCAP, and CNSSI 1253 mean, and does not stop to define them.

**Tone.** Operational, not poetic. Sentences are short, declarative, and outcome-led. Headlines describe what the product *does* or what the *customer gains*, not what it *is*.

**Casing.**
- **Slide titles (H1):** Title Case — *"How We Help the Coast Guard,"* *"API and Integration Layer,"* *"POA&M Automation."*
- **Slide subtitles (H2):** Title Case, often a benefit framing — *"Less Manual Work. Better Visibility, Faster RMF Execution."*, *"Built to Run the Work, Not Just Store It."*
- **Eyebrow / tagline lines:** ALL CAPS in IBM Plex Mono — *"A COMPLIANCE OPERATING PLATFORM BUILT FOR COAST GUARD MISSION SUCCESS."*
- **Body:** sentence case.
- **Acronyms:** preserved exactly — *RMF, SSP, POA&M, eMASS, FedRAMP, FIPS, IaC, OKTA, YubiKeys, NIPRNet BCAP, CNSSI 1253, DoD PKI/CAC.* `&` is preferred over "and" inside acronyms (POA&M).

**Person.** Third-person product voice (*"Paramify is…"*, *"Helps pull findings…"*) mixed with second-person benefit framing (*"Connect to the tools teams already use,"* *"Ingesting your data"*). Avoid "we" except in customer-facing framings like *"How We Help the Coast Guard."*

**Sentence shape.** Heavy use of **noun-phrase fragments** as feature labels — *"API-Driven Integrations,"* *"Automated Pull,"* *"Data Synchronization,"* *"Single Source of Truth"* — followed by a one-line clause that explains the benefit. This pattern (label + line) repeats across slides and is the dominant copy unit.

**Emoji.** None. No emoji appear anywhere in the deck. Don't introduce them.

**Specific examples to imitate:**
- *"Generate cleaner more current POA&M outputs with less spreadsheet work"*
- *"Reduces duplicate entry and manual reconciliation"*
- *"AWS GovCloud only, strong authentication: SAML via OKTA, FIPS-validated YubiKeys for privileged access, No CDN dependency, IaC-managed infrastructure using terraform and Helm"*
- *"Built to Run the Work, Not Just Store It"*

**Don'ts.** No marketing fluff ("revolutionary," "next-gen," "seamlessly"). No exclamation points. No questions in body copy. No emoji. No casual contractions in headlines.

---

## Visual Foundations

**Color.** Two anchors: **white** content slides and **Sean Blue** (`#1467FF`) statement slides. Sean Blue is the primary brand color and the only saturated hue used at scale. A small **accent palette** appears inside dashboard fragments and status chips: cyan `#64D2FF`, neon green `#20FC8F`, deep teal `#006690`, deep green `#006734`, danger red `#FF4C4C`, violet `#632CA6`. Neutrals are pure-grayscale (no warm or cool cast): `#FAFAFA`, `#F6F6F6`, `#F0F0F0`, `#E9E9E9`, `#BFBFBF`, `#8C8C8C`, `#777777`, `#595959`, `#262626`, `#141414`, `#000000`. Body copy is **grey-700 `#777777`**, not pure black — pure black is reserved for headlines and key labels.

**Type.** Four families, each with a clear job. **All Paramify-licensed faces are loaded locally from `fonts/`** — no Google Fonts substitution for the brand families.
- **Open Sauce Sans** — display only, used at 128px on the title slide for the deck headline. Tight letter-spacing (`-0.01em`). Loaded locally (Light → Black, with italics).
- **Open Sauce One** — slide titles (56px Medium, `line-height:100%`) and feature labels (40px Medium). The "voice" of every content slide. Loaded locally (Light → Black, with italics).
- **Open Sauce Two** — also licensed and available in `fonts/`; not used by the deck but tokenized as `--font-display-two` if it's needed.
- **Inter** — subtitles (40px Regular), body copy (24px Regular, `line-height:36–44px`), and most secondary text. Light weight (300) appears at 20px for de-emphasized supporting text.
- **IBM Plex Mono** — eyebrows and taglines, always uppercase, 24–40px. The "system stamp" feel.

Roboto appears heavily but only inside **embedded UI mockups** (dashboard tables, chips, menus) — treat it as the in-app UI font, not as a brand-surface font.

**Spacing.** Slide padding is `104–120px`. Major vertical rhythm: `64px` between hero blocks, `40px` between sibling sections, `30–36px` between tightly-related items, `12–20px` for label/value pairs. Inside cards: `19–24px` padding. The system is loose, generous, and geometric — never cramped.

**Backgrounds.** Three flavors:
1. **White content slide** (`#ffffff`) — the default. Used for almost every slide that isn't a section opener.
2. **Sean Blue full-bleed** (`#1467FF`) — title slide and section markers. Always white type.
3. **Light grey panel** (`#F6F6F6`) — the right-side "screenshot frame" inside a content slide where a UI fragment is shown floating with a subtle shadow.

No gradients. No photographic imagery. No textures or noise. No hand-drawn illustrations. The aesthetic is **flat, clinical, screenshot-forward** — the visual subject of most slides is a *piece of the actual product UI*, not decorative art.

**Animation.** The reference is a static deck. There are no animations to copy. For HTML transposition: keep transitions minimal and functional (200–250ms ease-out for state changes), no bounces, no parallax, no marquee.

**Hover / press states.** Not specified in the deck. Defaults: hover darkens fills by ~6% lightness or shifts opacity to 0.92; press shrinks by 1px translate or drops to 0.85 opacity. Match the in-app fragments' use of subtle border + shadow on cards.

**Borders.** Hairlines at `1px` or `2px` solid in `#E9E9E9` (panels) or `#F0F0F0` (table dividers). The "screenshot card" inside slides uses a `1.2px` border in `#E9E9E9`.

**Shadows.** Two registered: `0 0 20px rgba(0,0,0,0.20)` for floating UI cards on a grey panel, and `0 4px 16px rgba(0,0,0,0.15)` for elevated chips/popovers. No long-shadow or coloured-shadow effects.

**Corner radii.** A simple ladder: `8px` (chips, small controls), `12px` (buttons), `16px` (cards / image panels), `9.7px` (the in-app screenshot panel — preserved from source). Pills/avatars use full-radius (`9999px`).

**Cards.** Flat white or off-white (`#FCFCFC`) with a hairline border (`1.2px #E9E9E9`), 16px radius, optional soft shadow. No coloured left-border accents. No tinted card backgrounds.

**Transparency / blur.** Not used in the brand surface. Reserve for in-app overlays only.

**Layout rules.** Every content slide follows the same skeleton: **title (left, 56px) + supporting blurb (right, 24px)** → **subtitle (full-width, 40px)** → **two-column body** with the left column being prose / feature list and the right column being a UI screenshot panel on a `#F6F6F6` background. The 1920×1080 frame uses `120px` outer padding and a `1680px` inner content width. Logo+wordmark sits bottom-left of the title slide only.

**Imagery vibe.** No photography. No illustration. Only product-UI screenshots, rendered cleanly with a hairline border and soft shadow on a light grey panel. If photography is ever introduced, keep it cool-toned, neutral, and uncluttered — no warm grain or lifestyle vibe.

---

## Iconography

The deck uses two icon sources, both flat and monochrome:

1. **In-app product icons** — small (12 / 14 / 16px) line icons inside dashboard, table, and chip components. Stroke-based, single-weight, geometric. These are pulled directly from Paramify's product UI (treat them as Lucide-equivalent in style).
2. **Slide accent glyphs** — the **Paramify mark** (the isometric "P" cube) appears bottom-left of the title slide. No other large accent illustrations are used on the brand surface.

**Recommendation.** Use **[Lucide](https://lucide.dev)** as the substitute icon library. Lucide's stroke weight (`1.5–2px`), geometric construction, and rounded line caps match what's shown in the deck's UI fragments. Pull from CDN:

```html
<script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
```

Default icon size: **16px** for inline UI, **20px** for buttons, **24px** for slide-level decorative use. Stroke `1.5–2px`, color `currentColor`. **🚩 Substitution flagged** — please share the actual Paramify icon set if it exists; we'd swap Lucide out for it.

**Emoji.** Never used. Don't add any.

**Unicode glyphs.** Used sparingly inside body copy for typographic punctuation (em dash, curly quotes). Never as standalone icons.

**Logo files** (in `assets/`):
- `logo-blue-horizontal.png` — Sean Blue mark + wordmark on transparent. **Default lockup.**
- `logo-black-horizontal.png` — Black mark + wordmark on transparent. Use on light backgrounds where blue would clash.
- `logo-blue-on-white-horizontal.png` — Sean Blue lockup on a white tile. Use when placed on busy or coloured backgrounds.
- `paramify-mark.svg` / `paramify-wordmark-1.svg` — vector fragments extracted from the deck; useful for recolouring.

Minimum logo height: **24px** for inline product use, **32px** for slide footers, **48px+** for hero placement. Always preserve the proportions of mark + wordmark; don't separate them unless using `paramify-mark.svg` standalone in tight spaces (e.g. a favicon).
