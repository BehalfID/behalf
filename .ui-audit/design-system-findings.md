# Design System Audit Findings — BehalfID globals.css

**Audited:** 2026-06-05  
**File:** `/app/globals.css` (12,778+ lines)  
**Branch:** `ui-system-correction`

---

## Summary of Issues Found

### 1. Reduced Motion — Animation Guards (FIXED)

**Problem:** Three animation blocks applied unconditionally, bypassing the global `prefers-reduced-motion: reduce` override. Users with vestibular disorders would still see motion:

- `.home-step` scroll-driven animation (line ~7581) — `@supports (animation-timeline: view())` block set `opacity: 0` on `.home-step` with no reduced-motion guard
- `kicker-in` hero entrance animations (line ~12193) — `.home-hero .section-kicker/h1/sub` applied `kicker-in` unconditionally, overriding the guarded `hero-fade-up` block earlier in the file
- The second scroll-driven reveal block (`@supports (animation-timeline: view())` line ~10806) — already correctly wrapped, no fix needed

**Fixes applied:**
- Wrapped `.home-step` animation in `@media (prefers-reduced-motion: no-preference)` inside the `@supports` block
- Wrapped `kicker-in` selector block in `@media (prefers-reduced-motion: no-preference)`

**Remaining:**
- `ob-char`, `ob-wave`, `ob-step` onboarding animations — these start with `opacity: 0` and use `animation: ... forwards`. The global `animation-duration: 0.01ms !important` override handles these correctly (animation completes instantly, fills to visible state). No separate fix needed.
- `fd-line` transition — controlled via JS class toggle. With `transition-duration: 0.01ms !important` override, snaps to visible immediately. No fix needed.
- `ann-pulse`, `live-pulse`, `fd-live-pulse`, `fd-blink` — these are decorative pulses/blinks, not vestibular triggers. Covered by global override.

### 2. `[data-reveal]` Animations (VERIFIED — no fix needed)

The existing implementation is correct:
- Hidden state only applied inside `@supports not (animation-timeline: view())` AND `@media (prefers-reduced-motion: no-preference)`
- Users preferring reduced motion never see elements hidden
- Browsers supporting animation-timeline use scroll-driven CSS instead, `[data-reveal]` elements are always visible

### 3. Border-Radius Token Normalization (FIXED + TOKEN ADDED)

**Problem:** Marketing and UI cards used hardcoded pixel values outside the design token system.

**New token added to `:root`:**
```css
--radius-3xl: 16px;   /* large marketing cards */
```

**Fixes applied:**
- `.solution-card` `border-radius: 16px` → `var(--radius-3xl)` ✓
- `.faq-grid section` `border-radius: 12px` → `var(--radius-2xl)` ✓
- `.sandbox-header__panel`, `.sandbox-layer`, `.sandbox-scenarios`, `.sandbox-demo`, `.sandbox-trace` `border-radius: 14px` → `var(--radius-2xl)` ✓
- `.sandbox-layers` `border-radius: 14px` → `var(--radius-2xl)` ✓
- `.system-pipeline` `border-radius: 14px` → `var(--radius-2xl)` ✓
- `.ui-code-shell` `border-radius: 6px` → `var(--radius-lg)` (8px) ✓
- `.ui-code-copy` `border-radius: 5px` → `var(--radius-md)` ✓
- `.home-step__visual` `border-radius: 8px` → `var(--radius-lg)` ✓

**Still hardcoded (left for page-level agents — too many to normalize without visual audit):**
Many component-level elements still use hardcoded values like `6px`, `8px`, `10px`, `12px`. The design token system covers the full range — these require per-component review.

### 4. Code Block Chrome (VERIFIED — good quality)

`.ui-code-shell`, `.ui-code-bar`, `.ui-code-copy` are well-structured:
- `ui-code-bar` uses `rgba(255,255,255,0.035)` background for subtle chrome lift — appropriate
- `ui-code-copy` has proper hover/focus state with `border-strong` and text color transition
- `ui-code-copy--ok` uses semantic `--ok` / `--ok-border` / `--ok-bg` tokens ✓
- Copy button is 22px tall, inline-flex, with gap for icon — clean and functional
- Radius tokens now applied (see section 3)

### 5. `.home-deploy` and `.home-steps` Sections (VERIFIED — correct semantic colors)

Step visual variants use proper semantic tokens:
- `.home-step__visual--accent` → `var(--accent)` border + accent-tinted gradient ✓
- `.home-step__visual--deny` → `var(--deny)` border + red-tinted gradient ✓
- `.home-step__visual--ok` → `var(--ok)` border + green-tinted gradient ✓
- `.sv-verdict--deny` → `var(--deny)` ✓
- `.home-demo__decision--allowed/denied/needs_approval` → proper `--ok`/`--deny`/`--warn` tokens ✓

**Added missing semantic variant classes:**
- `.sv-label--deny { color: var(--deny); }` — was missing, `--ok` and `--accent` existed
- `.sv-label--warn { color: var(--warn); }` — added for completeness
- `.sv-verdict--ok { color: var(--ok); }` — was missing
- `.sv-verdict--warn { color: var(--warn); }` — added for completeness

### 6. Hardcoded rgba(99, 102, 241, ...) Audit

All occurrences reviewed. Classification:
- **Brand/CTA/accent purposes** (gradients, glow, hover states on interactive elements): Acceptable — these are brand identity expressions
- `.hero__event background: rgba(99,102,241,0.1)` — brand highlight, OK
- `.solution-card::before` radial gradient — decorative brand, OK
- `.solution-node--accent` border/background — accent variant node, OK
- `.solution-flow-line` gradient — brand flow line, OK
- `.solution-card__outcome` border-left — brand accent accent, OK
- `.hi-code` background/border — inline code brand highlight, OK
- `.sandbox-action__btn` border/background — accent action button, OK
- **No status-semantic misuse found** — all `rgba(99,102,241,...)` usages are brand/CTA, not status indicators

### 7. Duplicate / Near-Duplicate Rules

The hero animation has a functional duplicate: `hero-fade-up` (lines 10754+, correctly guarded) and `kicker-in` (lines 12194+, now fixed). Both apply `animation` to `.home-hero .section-kicker`, `.home-h1`, `.home-sub`. The later `kicker-in` block overrides the earlier `hero-fade-up` block. Both are now guarded. The `hero-fade-up` block is technically dead code but harmless — leaving for page-level cleanup.

### 8. Missing Hover/Focus States

Interactive elements reviewed:
- `.ui-code-copy:hover` — present ✓
- `.solution-card__cta a:hover` — present ✓  
- `.sandbox-scenario:hover` — present ✓
- `.sandbox-action-card:hover` — present ✓
- `.home-demo__tab:hover` — present ✓
- **Focus states (`:focus-visible`)**: Globally absent on most custom interactive elements. This is a known gap for page-level agents to address — adding focus rings to cards, scenario buttons, action buttons.

---

## CSS Tokens Added to `:root`

```css
--radius-3xl: 16px;  /* large marketing card radius */
```

---

## What Was Fixed vs. Left for Page-Level Agents

### Fixed in this audit:
1. `.home-step` scroll animation — reduced-motion guard added
2. `.home-hero .section-kicker/h1/sub` kicker-in animation — reduced-motion guard added
3. `.solution-card` radius tokenized via new `--radius-3xl`
4. `.faq-grid section`, sandbox containers, `.system-pipeline` radius → `--radius-2xl`
5. `.ui-code-shell`, `.ui-code-copy`, `.home-step__visual` radius → tokens
6. Added `--radius-3xl: 16px` to `:root`
7. Added missing `.sv-label--deny/warn` and `.sv-verdict--ok/warn` classes

### Left for page-level agents:
- `:focus-visible` states on interactive cards (sandbox-scenario, sandbox-action-card, home-demo__tab)
- Remaining hardcoded `6px`/`8px`/`10px`/`12px` radius values on component-level elements
- Dead `hero-fade-up` animation code (now overridden by `kicker-in`)
- Light-mode overrides for any new components added since the last light-mode audit pass
