# Motion Stability Audit — BehalfID

**Date:** 2026-06-05  
**Auditor:** motion-stability-agent  
**Files reviewed:** `app/globals.css` (12,936 lines), `components/ui/FlowDiagram.tsx`, `app/page.tsx`

---

## 1. FlowDiagram Fix Verification

### Status: Fix partially correct — height adjusted

The previously applied fix used `height: 334px` on `.fd-body`. Recalculation shows this is **10px too short**:

- 14 lines × (`0.82rem` × `1.7` line-height × 16px) = 14 × 22.3px = **312.2px**
- + padding (20px top + 12px bottom) = **32px**
- Total content = **344.2px**
- Previous `334px` would clip the cursor and last line.

**Fix applied:** Changed `height: 334px` → `height: 350px` (6px headroom).  
**Mobile override added:** `@media (max-width: 600px)` now sets `height: 306px` matching the smaller `0.72rem` font.

### `.fd-line` — CLEAN
- Uses `opacity + transform` only. No `max-height` or layout-property transitions.
- `@media (prefers-reduced-motion: reduce)` guard in place.

### `FlowDiagram.tsx` — CLEAN
- No inline `style=` props that change during animation.
- No dynamic height, padding, or scroll operations.
- State changes only toggle `fd-line--visible` className (opacity/transform CSS handles the rest).
- Scene cycling via `setSceneIdx` / `setVisibleCount` — no DOM geometry manipulation.

---

## 2. Full Animation Audit

### `@keyframes` inventory

| Keyframe | Properties animated | Layout-affecting? |
|---|---|---|
| `ob-enter` | `opacity`, `transform: translateY` | No |
| `ob-exit` | `opacity`, `transform: translateY` | No |
| `ob-wave-anim` | `transform: rotate` | No |
| `ob-char-enter` | `opacity`, `transform: translateY` | No |
| `home-step-in` | `opacity`, `transform: translateY` | No |
| `demo-pulse` | `opacity`, `transform: scaleX` | No |
| `hero-fade-up` | `opacity`, `transform: translateY` | No |
| `scroll-fade-up` | `opacity`, `transform: translateY` | No |
| `ann-pulse` | `opacity` only | No |
| `kicker-in` | `opacity`, `transform: translateX` | No |
| `live-pulse` | `opacity` only | No |
| `fd-live-pulse` | `opacity` only | No |
| `fd-blink` | `opacity` only | No |

**All `@keyframes` use only `opacity` and `transform`.** No layout properties animated anywhere.

### Transitions with layout properties

| Selector | Properties | Layout risk | Assessment |
|---|---|---|---|
| `.skip-link` | `top` | Technically yes | **SAFE** — `position: fixed`, outside document flow |
| `.tour-spotlight` | `top`, `left`, `width`, `height` | Yes | **SAFE** — `position: fixed`, overlay element, doesn't affect page flow |
| `.tour-dot` | `width` | Yes | **SAFE** — `position` normal, but contained in tour nav row with fixed height; pill expansion is cosmetic only |
| `.ob-choice` | `border-color`, `background`, `transform` | No | Clean |
| `.announcement-bar__arrow` | `transform: translateX` | No | Clean |

### `.ob-step--enter/exit` stability
- Onboarding pages use `min-height: 100svh` + `overflow: hidden` on `.ob-page`.
- `.ob-step` container is `display: grid` with fixed-width and the animation replaces the whole step content, not resizes it.
- **No layout shift** from onboarding enter/exit animations.

### `hero-fade-up` vs `kicker-in` conflict
- Both animate `.home-hero .section-kicker`, `.home-hero .home-h1`, and `.home-hero .home-sub`.
- `hero-fade-up` is wrapped in `@media (prefers-reduced-motion: no-preference)`.
- `kicker-in` is also wrapped in `@media (prefers-reduced-motion: no-preference)`.
- Both use `animation` shorthand with `both` fill mode — last declaration wins (kicker-in at line 12345).
- `hero-fade-up` defines `translateY`; `kicker-in` defines `translateX`. They animate from `opacity: 0` in both, so the effective animation is `kicker-in`. This is an overwrite, not a conflict — no layout shift, just redundant code. Not fixed (out of scope for stability).

### Scroll-driven reveals (`[data-reveal]`, `home-step-in`, `scroll-fade-up`)
- All use `opacity` + `transform: translateY` only.
- `@supports not (animation-timeline: view())` guards the IntersectionObserver fallback.
- `@supports (animation-timeline: view())` guards the scroll-driven block.
- No overlap; no layout shift.

---

## 3. Horizontal Overflow Check

### `.fd-line pre` — `white-space: pre`
- **Container:** `.fd-wrap` has `overflow: hidden` — clips any overflowing pre content on all axes.
- **Risk:** None. Overflow is contained.

### Other `white-space: pre` instances (lines 544, 2138, 2259, 6374)
- Each appears inside a scrollable context (code blocks with `overflow-x: auto`) or inside a bounded container.
- No bare `white-space: pre` without a containing `overflow-x: auto/hidden`.

### Fixed-width elements on mobile
- No fixed pixel widths wider than `min(X, 100%)` patterns found in animated elements.
- `fd-wrap` has no explicit width — inherits from its column container.

---

## 4. `app/page.tsx` Check

- **No `style=` props** anywhere in the file.
- No state-driven className changes that affect layout properties.
- All animation is purely CSS-driven via static classNames.
- `FlowDiagram` component is the only animated element with dynamic state.

---

## 5. Summary of Changes Applied

| File | Change | Reason |
|---|---|---|
| `app/globals.css` line ~12813 | `height: 334px` → `height: 350px` on `.fd-body` | 334px clips 14-line scenes by ~10px |
| `app/globals.css` line ~12933 | Added `height: 306px` override in `@media (max-width: 600px)` for `.fd-body` | Matches smaller 0.72rem font on mobile |

---

## 6. What Remains (Not Fixed — Intentional)

- **`kicker-in` overwrites `hero-fade-up`** for `.home-hero` children: both are valid `prefers-reduced-motion: no-preference` guards; the duplicate is cosmetic dead code but not a stability issue.
- **`.tour-dot` width transition**: Expands from 6px to 18px during tour pagination. This is inside a fixed-height tour nav row — technically causes a micro layout recalculation in that row, but the row has a stable height so no CLS impact. Could be converted to `transform: scaleX` if CLS scores are scrutinized at sub-0.1 thresholds.
- **`ob-step--enter/exit` lacks `@media (prefers-reduced-motion)` guard**: The onboarding animations run even when motion is reduced. Not a stability issue (opacity/transform only), but an accessibility gap. Out of scope for this stability audit.
