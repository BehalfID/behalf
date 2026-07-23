# Marketing Page Fixes — ui-system-correction

## Summary

Targeted fixes to public-facing marketing pages. No full rewrites. All changes are surgical.

---

## Task 1: Audit `app/page.tsx` (homepage)

**Findings:**

- No generic AI SaaS patterns. Copy is infrastructure-specific throughout.
- **Emoji structural use found** in `.home-flow-diagram` (simple mode): `🤖`, `🛡️`, and `✓ / ✗ / ⚠` in outcome badges.
- **`home-flow-node__label` class mismatch**: JSX used `home-flow-node__label` but CSS only defines `home-flow-node__name`. The label class was unstyled.
- Copy is earned — "Verify first. Execute second.", "Three lines between request and execution." are precise and not vague.
- No section repetition beyond the intentional advanced/simple mode splits.
- Announcement bar: "New — Deploy approval workflows are live. Set up in 5 minutes." is appropriately functional, not marketing-fluffy.

---

## Task 2: Fix emoji icons in homepage — FIXED

**File:** `app/page.tsx` (lines ~319–337)

**What changed:**
- Replaced `🤖` with an SVG lock/agent icon (rect + path + circle) in a `.home-flow-node__glyph` wrapper.
- Replaced `🛡️` with an SVG shield-check icon in `.home-flow-node__glyph--accent` wrapper (indigo accent styling).
- Replaced `✓ Go ahead` / `✗ Blocked` / `⚠ Ask me first` emoji-prefixed labels with clean monospace outcome text: `allowed` / `denied` / `needs approval` — matching the API response vocabulary and the advanced mode aesthetic.
- Fixed class name from `home-flow-node__label` (undefined) → `home-flow-node__name` (defined in CSS).

**CSS added** in `app/globals.css` after `.home-flow-node__name`:
```css
.home-flow-node__glyph        — 32×32 bordered box, muted icon color
.home-flow-node__glyph--accent — indigo tint + border for BehalfID node
```

---

## Task 3: Audit `app/blog/page.tsx` and `app/blog/[slug]/page.tsx`

**Findings:**

- Blog list layout is clean. Hierarchical: `h1` page title → `h2` card titles.
- Blog post: `h1` for post title, reading time meta, tags, prose — correct hierarchy.
- The slug page uses `hero__actions` in its footer for CTA buttons — this is a layout utility class, not a namespace violation; the class is defined generically.
- No emoji, no marketing fluff, no spacing inconsistencies visible in markup.

**No fixes needed.**

---

## Task 4: Audit `app/status/page.tsx`

**Findings:**

- Status dot classes: `status-dot--operational`, `status-dot--performance`, `status-dot--partial`, `status-dot--major` — all styled with semantic colors in CSS (green/amber/orange/red). Correct.
- Incident badge classes: `incident-badge--investigating` / `--identified` / `--watching` / `--fixed` — semantically differentiated in CSS.
- Severity badges: `incident-badge--minor` / `--major-sev` / `--critical` — styled progressively.
- **One fix:** The overall banner used `✓` and `!` as text characters. Replaced with small SVG icons (check mark for operational, exclamation for degraded states) that inherit `currentColor` from the banner's semantic color.

**File changed:** `app/status/page.tsx` — `overallBannerClass` icon span now renders inline SVG.

---

## Task 5: Audit `app/security/page.tsx` and `app/compliance/page.tsx`

**Security page findings:**

- Copy is appropriately infrastructure-focused. No marketing fluff. Limitations section is honest and specific.
- **One issue:** H1 was "Security and trust" — identical to the `.section-kicker` above it. This looks like placeholder copy.
  - **Fixed:** H1 changed to `Enforcement model, trust posture, limitations.` which is more specific and avoids the duplicate.
- `.security-card` has `border-top: 2px solid rgba(99,102,241,0.3)` as a permanent feature (not only on hover). Hover brightens it to `0.5`. This is consistent across both CSS definitions (lines 1650 and 11861). The task description was slightly misread — it's always present, hover just intensifies. Pattern is consistent, no change needed.

**Compliance page findings:**

- Clean legal copy. No marketing fluff.
- Compliance badges use `--active` (ok/green), `--planned` (warn/amber), `--conditional` (accent/indigo) — all semantic.
- `legal-page` / `legal-hero` / `legal-body` / `legal-section` hierarchy is correct.

**No further fixes needed.**

---

## Task 6: Check `PublicFooter`

**Findings:**

- Four-column nav: Product / Docs / Company / Legal. Each has 4–6 links. Not footer-overloaded.
- Brand column: logo, tagline, copyright, status note, social links.
- Uses `next-intl` translations — copy is not hardcoded.
- Clean and restrained. No changes needed.

---

## Task 7: Announcement bar

**Findings:**

- Design: `rgba(99,102,241,0.1)` background + `1px` accent border — clean, not gimmicky.
- The pulsing dot (`ann-pulse` animation) originally faded between opacity 1 and 0.4 on a 2.4s cycle — continuous pulsing.
- **Fix:** Changed keyframes to make the pulse less frequent (pulse occurs only from 70–85% of the cycle, then holds at full opacity for ~70% of the time). This reads as a one-time "ping" rather than a perpetually blinking dot.

**File changed:** `app/globals.css` — `@keyframes ann-pulse` updated.

---

## Task 8: `HomeDemo` component

**Findings:**

- Architecture is clean: tablist scenario switcher → console panel with request/gateway/decision → run trace button.
- Uses semantic outcome classes (`--allowed`, `--denied`, `--needs_approval`) tied to CSS variables.
- **Issue found:** Simple mode verdict used emoji: `"Approved ✓"` / `"Blocked ✗"` / `"Ask me first ⚠"`. This is inconsistent with the infrastructure aesthetic and uses structural emoji.
- **Fixed:** Replaced with plain text: `"Approved"` / `"Blocked"` / `"Needs approval"`. The color coding (green/red/amber via CSS class) provides sufficient visual differentiation.

**File changed:** `components/ui/HomeDemo.tsx`

---

## TypeScript check

Note: `npx tsc --noEmit` could not be run due to sandbox permissions during this session.

All changes are type-safe by inspection:
- `app/page.tsx`: JSX additions with string classNames and SVG markup
- `components/ui/HomeDemo.tsx`: String literal changes inside JSX expressions
- `app/status/page.tsx`: String `"✓"`/`"!"` → JSX elements (both are valid `React.ReactNode`)
- `app/globals.css`: CSS only

---

## Files changed

| File | Change type |
|------|-------------|
| `app/page.tsx` | Fix emoji icons → SVG, fix class name mismatch |
| `components/ui/HomeDemo.tsx` | Remove emoji from simple verdict labels |
| `app/status/page.tsx` | Replace text icon chars with SVG in banner |
| `app/security/page.tsx` | Fix duplicate H1 copy |
| `app/globals.css` | Add `.home-flow-node__glyph` styles, update `ann-pulse` animation |

---

## Accessibility fixes

### Task 1: `:focus-visible` states on interactive cards — FIXED

**File:** `app/globals.css`

Three interactive card types were missing keyboard focus rings. Added `:focus-visible` rules after each card's `:hover` block:

- `.sandbox-scenario:focus-visible` — after line 1886 (after the `:hover`/`--active` block)
- `.sandbox-action-card:focus-visible` — after line 2011 (after the `:hover`/`--active` block)
- `.home-demo__tab:focus-visible` — after line 7998 (after the `:hover` block)

All three rules apply `outline: 2px solid var(--accent); outline-offset: 2px;` — consistent with the design-system's focus ring pattern.

**Note:** There is a second `.sandbox-action-card` override block at line ~2770 (inside a contextual selector scope). That block resets `border`, `border-radius`, `padding`, and `background` — it does not override outline, so the base `:focus-visible` rule still applies correctly there.

---

### Task 2: `app/auth-client.tsx` — No issues

- All inputs are wrapped in `<label>` with explicit `<span>` text — correctly associated.
- Error `<p>` has both `role="alert"` and `aria-live="assertive"` at line 134.
- Submit button has descriptive text ("Create account" / "Log in").

No changes needed.

---

### Task 3: `app/verify-email/client.tsx` — FIXED; `app/forgot-password/client.tsx` — OK

**verify-email/client.tsx:**
- Line 157: error `<p>` had `role="alert"` but was missing `aria-live="assertive"`. Added `aria-live="assertive"`.
- Line 185: inline form error after code submission also had only `role="alert"`. Added `aria-live="assertive"`.
- The `<label htmlFor="verify-code">` / `<input id="verify-code">` pairing is correct.

**forgot-password/client.tsx:**
- Error `<p>` at line 83 already has both `role="alert"` and `aria-live="assertive"`. No fix needed.

---

### Task 4: `PublicNav.tsx` focus trap — OK

- `role="dialog"` and `aria-modal="true"` present on the drawer div.
- Focus moves to first focusable element on open (line 55–58).
- Tab/Shift+Tab cycles are trapped within the drawer (lines 31–50).
- `Escape` key closes the drawer (line 26).
- On close, `requestAnimationFrame(() => hamburgerRef.current?.focus())` returns focus to the hamburger button (line 16).

No changes needed.

---

### Task 5: `CodeBlock.tsx` copy button — OK

- Copy button already has `aria-label="Copy code"` at line 31.
- SVG icons inside the button have `aria-hidden="true"`.

No changes needed.

---

### Task 6: `ThemeToggle.tsx` and `ModeToggle.tsx` — OK

**ThemeToggle.tsx:**
- `aria-label` is dynamic: `"Switch to light mode"` (when dark) / `"Switch to dark mode"` (when light).
- `title` attribute mirrors the label for tooltip support.
- SVG icons have `aria-hidden="true"`.

**ModeToggle.tsx:**
- Each button uses `aria-pressed` (boolean) to communicate the active state to screen readers.
- `title` attributes describe each button's function ("Simple mode — plain English, no code" / "Advanced mode — full technical details").
- Wrapped in `role="group"` with `aria-label="Display mode"`.

No changes needed.

---

### Task 7: Responsive breakpoints — OK

Breakpoints found (main set):
- `@media (max-width: 860px)` — dashboard/docs shell collapses to mobile drawer
- `@media (max-width: 620px)` — public nav hamburger appears, `public-nav__links` hides
- `@media (max-width: 480px)` — tighter mobile stacking
- `@media (max-width: 768px)` equivalent covered by the 860px/720px bands

Coverage is appropriate. No horizontal overflow risks identified — all grid/flex containers use `min-width: 0` or `minmax(0, 1fr)` to prevent overflow.

---

### Task 8: Touch targets — FIXED

**`.public-nav__hamburger`:** Base rule sets `width: 36px; height: 36px` — below the 44px minimum for touch targets. This element is only shown at `@media (max-width: 620px)` (mobile).

**Fix applied in `app/globals.css`** inside the `@media (max-width: 620px)` block:
```css
.public-nav__hamburger {
  display: flex;
  justify-self: start;
  width: 44px;
  height: 44px;
}
```

**`.nav-action`:** `height: 34px` — this element appears only in the desktop nav (`public-nav__links`), which is hidden at mobile (≤620px). On desktop, 34px is acceptable. The mobile CTA uses the same class but it is a large enough tap area given its padding. No fix needed.

---

### TypeScript check

`npx tsc --noEmit` could not be executed due to sandbox permissions. All changes are type-safe by inspection:
- `app/globals.css`: CSS-only changes (no TypeScript impact)
- `app/verify-email/client.tsx`: Added `aria-live="assertive"` string props to existing `<p>` elements — valid JSX

---

## Accessibility fixes — Files changed

| File | Change |
|------|--------|
| `app/globals.css` | Add `:focus-visible` to `.sandbox-scenario`, `.sandbox-action-card`, `.home-demo__tab`; hamburger touch target 36px → 44px at mobile |
| `app/verify-email/client.tsx` | Add `aria-live="assertive"` to both `role="alert"` error paragraphs |

## Docs fixes

_Applied: 2026-06-05 — docs-ui-agent_

### Fix 1: Docs h1 — replace `clamp()` with fixed `rem` scale

**Locations:** `globals.css` — two `.docs-article h1` cascade blocks (~line 3695, ~line 11875)

**Problem:** Both rules used fluid `clamp()` sizing (`clamp(2rem, 4vw, 3.2rem)` and `clamp(1.8rem, 3.5vw, 2.8rem)`). Per product.md: "Fixed rem scale, not fluid. Clamp-sized headings don't serve product UI."

**Fix:** Changed to `font-size: 2.25rem`, `line-height: 1.1` in both places.

---

### Fix 2: `text-wrap: balance` on all doc headings

**Problem:** `text-wrap: balance` was absent from every doc heading rule.

**Fix:** Added to `.docs-article h1`, `.docs-article h2`, and `.docs-article h3` at all cascade positions.

---

### Fix 3: Article prose line-length capped at 72ch

**Locations:** `globals.css` — two `.docs-article__inner` blocks (~line 3690, ~line 9435)

**Problem:** Both instances used `max-width: 860px`. At 860px, body text lines reach ~100–110 characters — well beyond the 65–75ch readability optimum.

**Fix:** Changed both to `max-width: 72ch`. The outer `.docs-article` container (1320px) is unchanged; only the prose column is constrained.

---

### Fix 4: Docs callout system added

**Location:** `globals.css` — new block inserted after `.docs-next span`

**Problem:** No `.docs-callout` variants existed. Docs pages had no mechanism to visually distinguish notes, warnings, or danger notices.

**Fix:** Added `.docs-callout` base + three semantic variants:
- `.docs-callout--info` — indigo left-border, uses `--accent`
- `.docs-callout--warning` — amber left-border, uses `--warn` / `--warn-border` / `--warn-bg` tokens
- `.docs-callout--danger` — red left-border, uses `--deny` / `--deny-border` / `--deny-bg` tokens

All variants use the existing semantic token system from `:root`.

Usage:
```html
<div class="docs-callout docs-callout--warning">
  <strong>Warning</strong>
  <p>Rotating a key immediately invalidates the previous key.</p>
</div>
```

---

### Fix 5: HTTP method badge color differentiation

**Files:** `globals.css` `.endpoint-card span` block; `app/docs/api/page.tsx`

**Problem:** All HTTP method badges (GET, POST) rendered identically in indigo. GET is a read-safe operation; POST writes data. Visual sameness slows developer scanning.

**Fix:**
- `.endpoint-card span` base = POST default (indigo, unchanged appearance).
- Added `[data-method="GET"]` — green via `--ok` tokens (read-safe signal).
- Added `[data-method="PATCH"]` / `[data-method="PUT"]` — amber via `--warn` tokens.
- Added `[data-method="DELETE"]` — red via `--deny` tokens.
- Updated `app/docs/api/page.tsx`: both endpoint card renders now pass `data-method={method}` on the badge `<span>`.

---

### What was NOT changed

- **DocsLayout.tsx** — structure is correct. Sticky sidebar, inline search with popup results, mobile drawer with focus management (`useRef` + `requestAnimationFrame`), `aria-current="page"` on active nav links, Escape key closes drawer. No changes needed.
- **Mobile docs behavior** — `@media (max-width: 860px)` block is functional. Drawer sticks below header at `top: 60px`, correct z-index stacking (header: 50, drawer: 49).
- **Search CSS** — `.docs-search`, `.docs-search__results--popup`, `.docs-search__result` are clean. Popup has `box-shadow: 0 8px 24px rgba(0,0,0,0.3)` for depth, proper `z-index: 20`. No changes needed.
- **Sidebar active state** — `aria-current="page"` with `font-weight: 600` + `background: rgba(255,255,255,0.07)` is appropriately subtle — heavier than hover, lighter than selected pill. Correct.
- **CodeBlock component** — `ui-code-shell` / `ui-code-bar` / `ui-code-label` / `ui-code-copy` system is complete. `aria-label="Copy code"` present on button. `--ok` tokens applied to copied state. No changes needed.
- **Heading hierarchy** — All reviewed doc pages (overview, quickstart, api) use h1 → h2 → h3 correctly.
- **Code block usage** — All doc pages use the shared `CodeBlock` from `content.tsx`, which wraps `SharedCodeBlock` with `className="docs-code"`. Consistent throughout.

---

### Files changed (docs phase)

| File | Change type |
|------|-------------|
| `app/globals.css` | h1 fixed rem, text-wrap balance, 72ch prose, callout system, method badge colors |
| `app/docs/api/page.tsx` | Add `data-method` attributes to HTTP method badge spans |

---

## Product/Dashboard fixes

_Applied: 2026-06-05 — product-ui-agent_

### Task 1: `app/dashboard/client.tsx` audit

**Views mapped:** `HomeView`, `AgentsView`, `SitesView`/`SiteDetailView`/`SiteGuardIntegrationPanel`, `OnboardingView`, `LogsView`, `ApprovalsView`, `WebhooksView`, `WebhookView`, `AgentView`, `DashboardDocs`, `SettingsView`.

**CSS class inventory:** `.dashboard-panel`, `.dashboard-list`, `.dashboard-list-row`, `.dashboard-grid`, `.dashboard-section-header`, `.metric-grid`, `EmptyState className="dashboard-empty"`, `<Badge>` for all status displays.

**Hardcoded colors:** None. One inline `marginTop: 16` is non-color layout. No issues.

**Status:** All status badges use `<Badge>` component consistently. No hardcoded status colors.

---

### Task 2 + Task 6: Sidebar active state

**Problem:** Active sidebar nav items used only `background: rgba(255,255,255,0.07)` + `font-weight: 600` — too visually similar to the hover state for a control plane.

**Fix applied (`globals.css` ~line 3401):** Added `border-left: 2px solid var(--accent)` and `padding-left: 8px` to all four sidebar active-item selectors (`docs-sidebar`, `dashboard-sidebar`, `console-sidebar`, `app-sidebar`). Net left-edge distance is preserved (2px border + 8px pad = 10px same as original padding).

---

### Task 3: Console status colors

**Finding:** `app/console/client.tsx` uses `statusClass(status)` helper throughout. All status variants are CSS-defined with semantic tokens. No hardcoded colors. No changes needed.

---

### Task 4: Auth pages

**Finding:** `app/auth-client.tsx` is clean. Labels, inputs, copy, and feature list are all correct. No changes needed.

---

### Task 5 + Billing: Trial notice color

**Issue:** The trial active notice used `.billing-alert` which shares the red error style. A "trial active" status should be amber.

**Fix applied:**
- Added `.billing-alert--info` in `globals.css`: uses `--warn-border`, `--warn-bg`, `--warn` tokens.
- Updated `billing/client.tsx`: trialing notice uses `className="billing-alert billing-alert--info"`.

---

### Task 7: `.ui-stat` / `.metric` layout

**Problem:** These classes shared rules with `.flow-grid div` (marketing). No explicit `display` rule; `margin-top: 24px` on `strong` was for marketing cards, not infra metrics.

**Fix applied (`globals.css`):**
1. Added `display: flex; flex-direction: column; justify-content: space-between` for `.metric` and `.ui-stat`.
2. Overrode `strong { margin-top: auto }` — pushes value to bottom via flex, replacing the fixed 24px gap.

---

### Task 8: `console-empty-state` inconsistency

**Problem:** `.console-empty-state` had `border: 1px dashed`, no `min-height`, no `background` — inconsistent with the system empty state pattern.

**Fix applied (`globals.css`):** Updated to `min-height: 140px`, `border: 1px solid var(--border)`, `background: rgba(10,10,10,0.56)`, `padding: 24px 20px`. Sub-rules for `strong`, `p`, `code` unchanged.

---

### Files changed (Product/Dashboard pass)

| File | Change |
|------|--------|
| `app/globals.css` | Sidebar active accent border; `.ui-stat/.metric` flex layout; `.console-empty-state` system alignment; `.billing-alert--info` variant |
| `app/dashboard/billing/client.tsx` | Trial notice uses `billing-alert billing-alert--info` |
