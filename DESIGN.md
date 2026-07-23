# Design

## Color

Dark-first theme. Light theme supported via `[data-theme="light"]` attribute.

### Dark theme (default)
- Background: `#05080E` (`--bg`) — deep navy-black, not pure black
- Panel: `#0B1018` (`--panel`) — slightly elevated surface
- Surface: `#0D1420` (`--surface`) — card/panel default
- Surface soft: `#040608` (`--surface-soft`)
- Surface elevated: `#121B28` (`--surface-elev`)

### Ink
- Primary text: `#EEF2F6` (`--text`)
- Secondary text: `#9BA8B5` (`--text-2`)
- Muted: `#6B7B8C` (`--muted`)
- Muted-2: `#4A5668` (`--muted-2`)

### Borders
- Default: `rgba(255,255,255,0.08)` (`--border`)
- Strong: `rgba(255,255,255,0.14)` (`--border-strong`)
- Hairline: `rgba(255,255,255,0.05)` (`--hairline`)

### Brand accent
- Primary: `#6366F1` (`--accent`) — indigo
- Hover: `#5558E6` (`--accent-hover`)
- Soft: `rgba(99,102,241,0.10)` (`--accent-soft`)
- Glow: `rgba(99,102,241,0.14)` (`--accent-glow`)

### Decision semantics (permission system — must be semantically correct)
- Allowed/OK: `#6ee7b7` (`--ok`) with green border + bg
- Denied: `#fca5a5` (`--deny`) with red border + bg
- Warning/Pending: `#fcd34d` (`--warn`) with amber border + bg

### Usage rules
- `--ok` = allowed, active, success, enabled
- `--deny` = denied, error, destructive, failed
- `--warn` = pending, requires approval, processing, warning
- `--accent` (indigo) = brand, CTAs, links, interactive highlights ONLY — not status

## Typography

### Fonts
- Sans: Inter (`--font-sans`) via Google Fonts
- Mono: JetBrains Mono (`--font-jetbrains`) via Google Fonts
- Feature settings: `"ss01" on, "cv11" on` for Inter alternates

### Scale
- Display heading: `clamp(2.8rem, 5vw, 5.6rem)` — hero H1
- Page heading: `clamp(2.1rem, 4vw, 4.2rem)` — section H1
- Section H2: `clamp(2rem, 4vw, 4rem)`
- Body: `1rem` / `16px`, line-height `1.55`
- Small/UI: `0.875rem`, `0.82rem`, `0.76rem`
- Code: JetBrains Mono, `0.82rem`

### Tracking
- Display: `-0.04em` (`--tracking-display`)
- Heading: `-0.02em` (`--tracking-heading`)
- UI labels: `-0.01em` (`--tracking-ui`)
- Kicker/uppercase labels: `0.18em`

### Rules
- Body line length: max `72ch`
- No all-caps body copy
- Kickers: `0.68rem`, `font-weight: 700`, `letter-spacing: 0.18em`, `text-transform: uppercase`
- Variable font weights used: 500, 560, 600, 680, 700, 760, 780, 800, 820

## Spacing

4px base scale:
- `--s-1: 4px` through `--s-12: 160px`
- Section padding: `96px` (`--section-padding`)
- Container max: `1200px` (`--container`)
- Doc container max: `1100px` (`--container-doc`)
- Gutter: `24px` (`--gutter`)

## Radius

- `--radius-sm: 3px`
- `--radius-md: 5px`
- `--radius-lg: 8px`
- `--radius-xl: 10px`
- `--radius-2xl: 12px`
- `--radius-pill: 999px`

Standard usage:
- Inputs: `8px`
- Buttons: `8px`
- Cards: `6px` (tight) or `12-16px` (marketing)
- Badges: `999px` (pill)
- Code blocks: `6px`
- Modals/panels: `10-14px`

## Shadows

- `--shadow: 0 24px 80px rgba(0,0,0,0.36)`
- `--shadow-sm: 0 1px 0 rgba(255,255,255,0.03) inset`
- `--shadow-md: 0 1px 2px rgba(0,0,0,0.5)`
- `--shadow-hero: 0 0 0 1px rgba(255,255,255,0.05), 0 32px 72px rgba(0,0,0,0.6)`

## Components

### Buttons
- Base: `.ui-button` — `min-height: 40px`, `border-radius: 8px`, `border: 1px solid --border-strong`
- Primary: indigo background, white text
- Secondary: subtle white background, text color
- Danger: **must use red/deny semantics** (currently incorrectly using indigo)
- Ghost: transparent, text only with hover state

### Cards
- App/product cards: `.ui-card` — `border: 1px solid --border`, `border-radius: 6px`, `background: --surface`
- Marketing cards: larger radius (`12-16px`), may have gradient top-edge
- No nested cards

### Badges
- Decision badges: `.ui-badge--allow` (green), `.ui-badge--deny` (red), `.ui-badge--warn` (amber)
- Status badges: `.console-status--active/allowed` must use green (NOT indigo brand color)
- Status badges: `.console-status--denied/error/failed` must use red
- Status badges: `.console-status--pending/processing` must use amber

### Inputs
- `.ui-input` — `min-height: 42px`, `border-radius: 8px`, dark fill
- All inputs must have associated `<label>` elements

### Code blocks
- `.ui-code-shell` — panel with label bar + copy button
- Monospace, `0.82rem`, line-height `1.5`

### Empty states
- `.ui-empty` — centered content, muted, with actionable next step when possible
- Should include icon + title + description + optional CTA
- NOT just a blank bordered box

## Layout

### Shells
- App shell: fixed sidebar + scrollable main content
- Dashboard sidebar: `240px` wide, sticky, nav links with active state
- Console sidebar: same pattern
- Docs: sidebar with search + nav, article with constrained width

### Marketing layout
- Max container: `1200px`, `margin-inline: auto`
- Section padding: `clamp(72px, 9vw, 120px) 0`
- Hero grid: `2-column` (content + visual), aligns to start

### Grid rules
- Feature grids: 4-column on desktop, 2-column tablet, 1-column mobile
- No auto-fit grids with fewer than 3 columns on desktop (use flexbox instead)

## Motion

- Transitions: `140-180ms ease` for hover states
- Reveal animations: use `data-reveal` attribute pattern
- Reduced motion: all animations should fall back to `opacity` transition only
- No bounce, no elastic
- No layout property animation

## Dark mode

All values defined above are for dark mode (default). Light theme via `[data-theme="light"]` overrides: inverted surfaces, dark ink on light backgrounds.

## Anti-patterns

- Indigo accent color used for status/decision states (green/red/amber only for decisions)
- Random decorative gradients not tied to grid/surface structure
- Oversized pill cards with emoji icons
- Generic 3-column feature grids with no hierarchy
- Missing focus rings
- Missing form labels (placeholder-only)
- Neutral grey for denied/error states
