# Behalf/ID design system (production)

Ported from `BehalfID/agent-gatekeeper-suite` for the Next.js production app.
Canonical CSS: `app/lovable-design-system.css`. React primitives: `components/design-system/`.

Production still owns auth, APIs, data, and routing. This document owns visual language.

## Motif — the decision path

The slash in **Behalf/ID** is the brand's structural device. It is expressed as a
thin copper **decision path**:

```text
Agent → Identity → Permission → Approval (when required) → Action
```

Rules:

- The path is a line, never decoration. It appears in the hero canvas, authority
  map, approval sequence, and as the `slash-seam` section seam.
- Copper (`--primary` / `--accent-base`) marks *decision*, warning marks
  *waiting on a human*, success marks *passed*. Never use copper as a large
  flat background except in the final CTA field.
- Permission scope is drawn as **boundaries** (regions), not list rows.

## Section environments

Marketing pacing comes from alternating environments, not borders.

| Class | Use |
| ----- | --- |
| `env-ivory` | Warm off-white — hero, identity, approvals |
| `env-stone` | Pale neutral — proof strip, editorial, security |
| `env-copper` | Copper-tinted neutral — permissions |
| `env-charcoal` | Deep charcoal, pair with `dark` — authority map, dashboard |
| `env-ink` | Near-black, pair with `dark` — developers |
| `env-copper-field` | Rich copper — final CTA |
| `canvas-light` | Bright product surface inside a deep section (light theme) |

Light mode is the primary marketing expression; dark mode maps each environment
onto its dark register. Theme is controlled by production `data-theme` and
mirrored to the `.dark` class for Lovable selectors.

## Typography

Instrument Sans (UI) + JetBrains Mono (code).

Scale: `display-2xl` (hero) → `display-xl` (editorial) → `display-lg` (section)
→ 16–18px body. At most one `display-2xl` and one `display-xl` per page.

## Product visuals

Use `canvas-frame` for product surfaces. Marketing previews are curated: fewer
columns, larger type, secondary metadata hidden. No request IDs or terminal
noise above the fold.

## Motion

Animation explains product behaviour. Nothing loops for decoration.

| Export | File | Purpose |
| ------ | ---- | ------- |
| `usePrefersReducedMotion` | `hooks/use-motion.ts` | reduced-motion flag |
| `useInView` | `hooks/use-motion.ts` | one-shot entrance |
| `useSequence` | `hooks/use-motion.ts` | stepped explainer |
| `<Reveal>` | `components/design-system/motion.tsx` | scroll reveal |
| `reveal-hidden` / `reveal-shown` | CSS | reveal states |
| `path-pulse`, `mark-in`, `lift` | CSS | path / evidence / hover |

`prefers-reduced-motion: reduce` collapses durations globally and forces
sequences/`Reveal` to their final state.

## Claim hygiene

- `<IllustrativeTag>` on any mock or non-measured product number.
- `<BetaTag>` / `In development` on adaptive-engine functionality until enforced.
- Prefer qualitative states over invented percentages.
- Explicit policy remains authoritative; administrators approve adaptive enforcement.
