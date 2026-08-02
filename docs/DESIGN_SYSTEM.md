# Behalf/ID design system (production)

Ported from `BehalfID/agent-gatekeeper-suite` for the Next.js production app.
Canonical CSS: `app/lovable-design-system.css`. React primitives: `components/design-system/`.

Production still owns auth, APIs, data, and routing. This document owns visual language.

## Opt-in (required)

Lovable surfaces must opt in explicitly:

```tsx
<div className="ds">
  {/* Lovable tokens, environments, and nested utilities apply here */}
</div>
```

Rules:

- Do **not** redefine production `:root` tokens (`--muted`, `--border`, `--surface-2`, etc.) with Lovable meanings.
- Nested utilities (`env-*`, `display-*`, `slash-seam`, `canvas-frame`, `path-pulse`, `lift`) only match inside `.ds`.
- Prefixed classes (`ds-header`, `ds-footer`, `ds-wordmark`, `ds-reveal-*`) are unique and safe.
- Design-system `MarketingHeader` / `MarketingFooter` already include `ds` on their roots but are **not** live until Phase 2 routes exist.
- Existing `PublicNav` and `PublicFooter` remain the production chrome.

## Theme synchronization

1. Production storage key: `localStorage.theme` (`dark` | `light` | absent = system).
2. Boot script in `app/layout.tsx` and `applyResolvedTheme()` in `lib/theme.ts` set:
   - `document.documentElement.dataset.theme` / `data-theme`
   - `document.documentElement.classList.toggle("dark", theme === "dark")`
3. Lovable dark tokens activate only under `.ds` when `html.dark` / `html[data-theme="dark"]` is set, or via a nested `.dark` band inside `.ds`.

Do not adopt the Lovable `behalfid-theme` storage key.

## Reduced motion

Honoured twice:

1. CSS collapses animation/transition durations for `.ds *` and `ds-reveal-*` under `prefers-reduced-motion: reduce`.
2. `usePrefersReducedMotion()` makes `useSequence` jump to the final step and `<Reveal>` render shown immediately.

Controls remain available.

## Motif — the decision path

The slash in **Behalf/ID** is the brand's structural device. It is expressed as a
thin copper **decision path**:

```text
Agent → Identity → Permission → Approval (when required) → Action
```

Rules:

- The path is a line, never decoration. It appears in the hero canvas, authority
  map, approval sequence, and as the `slash-seam` section seam.
- Copper (`--ds-primary` / `--accent-base`) marks *decision*, warning marks
  *waiting on a human*, success marks *passed*. Never use copper as a large
  flat background except in the final CTA field.
- Permission scope is drawn as **boundaries** (regions), not list rows.

## Section environments

Marketing pacing comes from alternating environments, not borders. Classes below
apply only inside `.ds`.

| Class | Use |
| ----- | --- |
| `env-ivory` | Warm off-white — hero, identity, approvals |
| `env-stone` | Pale neutral — proof strip, editorial, security |
| `env-copper` | Copper-tinted neutral — permissions |
| `env-charcoal` | Deep charcoal, pair with `dark` — authority map, dashboard |
| `env-ink` | Near-black, pair with `dark` — developers |
| `env-copper-field` | Rich copper — final CTA |
| `canvas-light` | Bright product surface inside a deep section (light theme) |

## Typography

Instrument Sans (UI, deliberate Phase 1 global `--font-sans` normalization in
`app/globals.css`; `next/font` registers `--font-instrument-sans` in
`app/layout.tsx`) + JetBrains Mono (code). Inter remains a fallback.

Scale (inside `.ds`): `display-2xl` → `display-xl` → `display-lg` → 16–18px body.
At most one `display-2xl` and one `display-xl` per page.

## Motion

| Export | File | Purpose |
| ------ | ---- | ------- |
| `usePrefersReducedMotion` | `hooks/use-motion.ts` | reduced-motion flag |
| `useInView` | `hooks/use-motion.ts` | one-shot entrance |
| `useSequence` | `hooks/use-motion.ts` | stepped explainer |
| `<Reveal>` | `components/design-system/motion.tsx` | scroll reveal (`ds-reveal-*`) |
| `path-pulse`, `mark-in`, `lift` | CSS under `.ds` | path / evidence / hover |

## Safe Phase 2 primitives

Use from `components/design-system`:

- `Wordmark`, `BrandMark`, `AgentAvatar`
- `Reveal`, `IllustrativeTag`, `BetaTag`
- `Section`, `SectionHeading`
- motion hooks

Do **not** cut over `MarketingHeader` / `MarketingFooter` until `/pricing`,
`/adaptive-engine`, and `/contact` exist. Do **not** install Lovable shadcn —
restyle existing `components/ui/*` instead.

## Claim hygiene

- `<IllustrativeTag>` on any mock or non-measured product number.
- `<BetaTag>` / `In development` on adaptive-engine functionality until enforced.
- Prefer qualitative states over invented percentages.
- Explicit policy remains authoritative; administrators approve adaptive enforcement.
