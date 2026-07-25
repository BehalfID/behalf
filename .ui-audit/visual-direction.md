# Visual Direction — BehalfID Enterprise Operating-System Aesthetic

_Authored: 2026-06-05 — visual-direction-agent_
_Scope: `app/page.tsx` homepage + `app/globals.css` token/component system_
_Reference vocabulary: Palantir Foundry, Terminal Industries, Vercel infra surfaces, Linear discipline, security dashboards._

The product is a **control plane**: every agent action is checked against a permission passport before it executes. The UI must read as an **operator-grade instrument**, not a marketing site with a product bolted on. Density, structure, and semantic precision over decoration. The homepage already does most of this well — this document tightens it and locks the rules so it does not drift.

---

## 1. Core visual rules (enforce these)

These are concrete, checkable rules. A rule is "violated" when a selector contradicts it.

1. **Surface hierarchy is strictly four-step and monotonic.** `--bg (#05080E)` → `--panel (#0B1018)` → `--surface (#0D1420)` → `--surface-elev (#121B28)`. A nested surface must be exactly one step elevated from its parent — never skip a step, never invert. No ad-hoc `rgba(8,12,20,…)` / `rgba(10,10,10,…)` literals where a token exists (the hero terminal and `fd-wrap` use raw literals like `#080c14`, `rgba(8,12,20,0.92)` — acceptable only because they're aria-hidden marketing visuals, but do **not** propagate this pattern to product UI).

2. **Product-UI radius ceiling is 8px (`--radius-lg`).** Cards, panels, consoles, code blocks, badges-aside, inputs, buttons in any dashboard/console/sandbox surface get `--radius-sm/md/lg` (3/5/8px) only. Pills (`--radius-pill`) are the single exception, for badges and tabs. Radius ≥ 12px (`--radius-2xl/3xl`, raw 14/16/18px) is permitted **only** on marketing hero visuals and decorative cards above the fold. See anti-pattern AP-2.

3. **Section kicker is fixed: `0.68rem / 700 / 0.18em tracking / uppercase`, indigo, with a 1.5px indigo left-border + 10px pad.** Already correct (`globals.css:481`). No kicker may deviate in size, weight, or tracking. This is the single most repeated structural signal on the page — it must be pixel-identical everywhere.

4. **Mono key–value rows are the primary data display, not prose.** Any "what BehalfID sees / decides" content renders as a `grid-template-columns: <label-col> 1fr` row with an uppercase mono label and a mono value — never as a sentence. The hero terminal (`hero-terminal__row`), step visuals (`sv-rows`), and demo console (`home-demo__rows`) all do this correctly. Lock the label column to mono `600 / 0.68–0.7rem / uppercase / 0.06–0.08em` and the value to mono `400 / 0.83–0.85rem`.

5. **Decision states are green / red / amber only — never indigo.** `--ok` = allowed/active/success. `--deny` = denied/error/failed/destructive. `--warn` = pending/requires-approval/processing. Indigo `--accent` is reserved for brand, CTAs, links, kickers, and the BehalfID node itself (the thing doing the deciding) — never the outcome. Currently clean (verified `console-status` block at `globals.css:660–710` and `home-demo__verdict` at `8124`).

6. **Color-coded left-border is the canonical "this is a typed surface" signal.** A 2px left-border in the semantic color (`home-step__visual--accent/--deny/--ok`, `home-demo__decision--*`, sidebar active item) communicates type/state at a glance. Standardize on **2px** left-border for all such surfaces (sidebar active is already 2px per page-fixes). Do not use top-borders for state (the `.security-card` 2px indigo top-border is decorative, not stateful — flag, see AP-4).

7. **Borders and hairlines do the structural work; shadows do not.** Every panel, row divider, and section boundary is a `1px solid var(--border)` or `var(--hairline)`. Shadows are permitted only on genuinely floating/overlay surfaces (hero terminal, demo console, tour card, modals, search popup). A flat product card gets **zero** shadow — structure comes from the border. No `box-shadow` purely for "lift" on dashboard cards.

8. **Section rhythm: marketing sections breathe (`clamp(80px,10vw,140px)` block padding); control-plane data is dense.** The vertical clamp padding on `home-steps`, `home-code`, `home-deploy`, `home-demo` is correct for a marketing homepage. But **inside** any data surface (terminal, console, step visual, table) padding must stay tight: `18–32px`, mono rows gapped `6–8px`. Never let a data panel inherit marketing-scale padding — that produces the "fluffy dashboard" anti-pattern.

9. **Display/heading type uses the `-0.04em` floor and 800-class weights; nothing on this page goes below it.** Hero H1, section H2s sit at `font-weight: 800–820`, `letter-spacing: -0.035em to -0.04em`, `line-height: 0.96–1.05`. The `-0.04em` is a **floor** (most negative allowed) — tighter is forbidden. Confirmed no violations file-wide.

10. **Mono is the voice of the machine; sans is the voice of the product.** Every machine artifact — agent ids, request ids, actions, vendors, verdicts, JSON, CLI — is JetBrains Mono. Every explanatory sentence, heading, label-for-humans is Inter. Do not render `req_K9mXp2qR` or `deploy` in sans; do not render body copy in mono. This boundary is currently respected — keep it absolute.

11. **Stats / metrics are bottom-aligned values with uppercase mono labels, separated by 1px dividers — not cards.** `home-hero__stats` (flex row, `border-right: 1px` dividers, no card chrome) is the correct operator pattern. Never wrap a single metric in a rounded shadowed card. Value = `800 / -0.04em`, label = `0.68rem / uppercase / muted-2`.

12. **One accent glow per viewport, tied to the primary surface.** The single radial `home-hero::before` indigo glow behind the hero is acceptable as a focal anchor. Additional decorative gradients (`home-flow-section` full-bleed vertical indigo wash at `12720`) are **decoration not tied to structure** — flag for removal/reduction (AP-3). Glows must originate from a real surface (the terminal, the hero), never float in empty section space.

13. **Step / sequence numbers are mono, indigo, `700 / 0.68–0.72rem / 0.14–0.18em`.** `home-step__num` and `home-deploy__num` are correct. These read as register/index markers, not decorative big numerals. Do **not** introduce oversized ghost numerals (e.g. `clamp(3rem,8vw,8.5rem)` index digits seen on some marketing sections at `2305/2648` — fine for pure marketing pages, never on the control-plane homepage).

14. **Tables / row-lists use dividers, not zebra striping or card-per-row.** Audit-log and decision-list rows separate with `1px solid var(--hairline)`, hover with a subtle `rgba(255,255,255,0.03)` fill. No rounded per-row cards, no alternating backgrounds. (Applies to dashboard `dashboard-list-row` — already compliant per product pass.)

15. **Interactive density: hover/focus transitions `140–180ms ease`, opacity + color + border only.** No transform-scale on cards, no layout animation. Focus-visible is always a `2px solid var(--accent)` ring with `2px` offset. The scroll-reveal `home-step-in` (translateY 24px) is the one permitted entrance motion and is correctly gated behind `prefers-reduced-motion`.

---

## 2. Anti-pattern list (still present or at risk)

- **AP-1 · Marketing gradients leaking onto data surfaces.** The `135deg` tinted gradients on `home-step__visual--*` and `home-demo__decision--*` (`rgba(…,0.07) → surface`) are borderline. They're tied to the 2px semantic left-border so they currently read as "typed surface," which is acceptable — but they must stay at ≤0.07 alpha and never appear without the matching border. If the border is removed, the gradient becomes pure decoration. **Rule: tint gradient only ever co-occurs with its semantic left-border.**

- **AP-2 · Radius drift above the product ceiling.** `.sandbox-focus .decision-console` uses `border-radius: 16px` (`globals.css:5895`) and `.tour-card` uses `14px` (`11332`). The decision console is a **product/operator surface** — 16px makes it read as a marketing card. Should be `8px`. The tour card is a product overlay — `14px` is too soft for an instrument; `8–10px` is the ceiling. (The `18px` hero-visual radii at `2344`/`5632` are marketing-only and may stay.)

- **AP-3 · Decoration-only section gradient.** `.home-flow-section` (`12718`) has a full-width vertical `rgba(99,102,241,0.03)` wash not anchored to any surface — it's atmospheric fog, not structure. Remove it or replace with a hairline top/bottom rule. The flow diagram terminal (`fd-wrap`) already provides the focal surface; the section doesn't need a wash too.

- **AP-4 · Stateful-looking top-border that carries no state.** `.security-card` has a permanent `2px indigo top-border` (noted in page-fixes Task 5). On a control plane, a colored edge **implies type/state**. An indigo top-edge on every security card is decorative and dilutes the "indigo = brand/decision-maker, color-edge = typed surface" grammar. Demote to a `1px var(--border)` top or move the accent to a left-border only on genuinely active/featured cards.

- **AP-5 · Center-aligned marketing blocks inside an instrument.** `home-flow-section__inner` is `text-align: center` with `max-width: 800px`. Centered prose is a marketing tell. The flow section is explanatory so this is tolerable, but the final-CTA centering (`home-actions--center`) plus centered H2 is the most "generic SaaS" moment on the page. Keep CTAs but consider left-aligning to match the rest of the operator layout. **Rate: tolerate, don't expand.**

- **AP-6 · Continuous looping pulse on `LIVE` badge.** `hero-terminal__badge--live` runs `live-pulse 2s infinite` (`12510`). A perpetually blinking badge is a casino tell, not an instrument. The announcement-bar dot was already de-pulsed (page-fixes Task 7); apply the same restraint here — single ping or static. **Flag.**

- **AP-7 · Raw color literals where tokens exist.** Hero terminal / flow terminal use `#080c14`, `rgba(8,12,20,0.92)`, `rgba(40,200,64,0.7)` etc. Acceptable inside aria-hidden marketing chrome (mimicking a real terminal's traffic-light dots), but these literals must **never** be copied into product CSS. Watch for `rgba(10,10,10,…)` surfaces in product code (e.g. `console-empty-state` background) — prefer tokens.

---

## 3. Typography audit

**Fluid `clamp()` on product/dashboard UI (not marketing hero) — these are the violations:**

- ✗ **`.ui-page-header h1, .dashboard-header h1, .console-header h1` → `clamp(2.1rem, 4vw, 4.2rem)`** (`globals.css:516`). This is **product UI**, not a marketing hero. A dashboard/console page title scaling up to 4.2rem on wide monitors is the single clearest typography violation on the system. Per DESIGN.md/product rules: product headings use a **fixed rem scale**. This must become a fixed value (proposal: `2rem`, `line-height: 1.05`). The docs h1 was already fixed this way (page-fixes Docs Fix 1, set to `2.25rem`); dashboard/console h1 was missed.

**Marketing clamp usage (acceptable — keep fluid):**
- ✓ `home-h1` `clamp(2.4rem, 4.2vw, 4.6rem)`, `home-steps__h2` `clamp(2.2rem,5vw,4rem)`, `home-code__h2`, `home-deploy__h2`, `home-demo__h2`, `home-flow-section__h2`, hero `clamp(2.8rem,5vw,5.6rem)` — all marketing display type. Fluid is correct here.
- ⚠ **`home-step__title` `clamp(1.5rem, 2.4vw, 2rem)`** and **`home-deploy h3` `clamp(1.25rem,2.2vw,1.6rem)`** sit at the boundary — these are sub-headings inside a data-adjacent context. Tolerable on the marketing homepage, but if this exact component is ever reused in-product, convert to fixed rem.

**Font-weight below 500:** None found file-wide. All `font: 400 …` instances (8 total) are intentional **mono code/value** declarations (`sv-rows code`, `hero-terminal__val`, `home-demo__reason`, etc.) where 400 is the correct monospace body weight. No sans text drops below 500. **Clean.**

**Letter-spacing floor (`-0.04em`):** No selector exceeds the floor (nothing more negative than `-0.04em`). Display type sits exactly at `-0.04em` (`home-h1`, `home-steps__h2`, `home-hero__stat-val`), headings at `-0.025em to -0.035em`. **Clean.**

**Kicker discipline:** `.section-kicker` is exactly `0.68rem / 700 / 0.18em` (`481`). Compliant. The mono micro-labels (`sv-label` `0.65rem/700/0.14em`, `hero-terminal__label` `0.68rem/600/0.08em`) are a deliberately tighter-tracked secondary tier — consistent and correct.

---

## 4. Color discipline audit

- **Indigo never used for status/decision:** Confirmed. `console-status--*` block (`660–710`) maps active/allowed→green, denied/error/failed→red, pending/processing/approval→amber, disabled/revoked/expired→muted-grey. `ui-badge--allow/deny/warn` (`713–728`) and `home-demo__verdict--*` (`8124`) all semantic. Indigo appears only on brand/CTA/link/kicker/step-num and the BehalfID decision-maker node — correct by the grammar.
- **Neutral grey for denied/error:** None. Denied always red. (Disabled/revoked correctly use grey because they carry *no* decision weight — that's the right exception.)
- **Decoration-only gradients not tied to surface structure:**
  - ✗ `home-flow-section` vertical indigo wash (AP-3) — remove.
  - ⚠ `home-step__visual--*` / `home-demo__decision--*` 135° tints — tied to semantic left-border, so they're *structural-adjacent*. Keep, but enforce the co-occurrence rule (AP-1).
  - ✓ `home-hero::before` radial glow — single focal anchor behind the hero, tied to the hero surface. Acceptable.
- **Traffic-light terminal dots** (`hero-terminal__dots` red/amber/green literals) — these are a skeuomorphic terminal reference, aria-hidden, not status semantics. Acceptable as marketing chrome.

---

## 5. Spacing discipline

**Fluffy (reads as marketing breathing-room — acceptable on homepage, would be wrong in-product):**
- `home-steps__intro` `margin-bottom: 72px`, `home-deploy__intro` `64px`, `home-demo__head` `40px` — generous but intentional section intros. ✓ for marketing.

**Dense (correct control-plane rhythm — preserve):**
- `hero-terminal__body` `18–20px` padding, rows gapped `8px`; `sv-rows` `8px` gap; `home-demo__rows` tight — these are correctly instrument-dense. ✓

**At-risk:**
- ⚠ `home-step` block padding `clamp(48px,6vw,80px)` per step × 4 steps is a lot of vertical real estate. On the homepage it's fine (it's a marketing narrative). Flag only so it isn't copied into any in-product "how it works" panel.
- ⚠ `home-flow-section` only `64px 0` padding (`12719`) — notably tighter than the `clamp(80px,10vw,140px)` of its neighbors. This inconsistency makes the flow section feel cramped between two airy sections. Either lift to the standard clamp or accept it as a deliberate dense interlude (recommend the latter — a dense diagram band between airy narrative reads well).

---

## 6. Component direction (exact desired treatment)

- **Cards (product):** `1px solid var(--border)`, `--radius-md/lg` (5–8px), `background: var(--surface)`, **no shadow**. State communicated by 2px semantic left-border, never by shadow or top-edge. Optional `20px × 20px` faint grid background-image (as `home-step__visual` does, `0.022` alpha) is the approved "engineering surface" texture — keep it subtle.
- **Panels / consoles:** `1px solid var(--border)`, `--radius-lg` (8px max, fix the 16px decision-console). Internal structure via `1px` dividers and `border-inline` column separators (the demo console's `border-inline` gateway column is the model). Floating consoles (demo, terminal) may carry a `0 0 0 1px rgba(99,102,241,0.08)` hairline-glow + deep shadow — that's the "this is the live instrument" treatment, reserved for ≤2 surfaces per page.
- **Badges:** pill (`--radius-pill`), `min-height: 24px`, `0.76rem`, semantic color triplet (text+border+bg from the matching `--ok/deny/warn` token set), `text-transform: capitalize`. `760` weight. Never indigo for a status badge.
- **Tables / row-lists:** header row in uppercase mono micro-label style; body rows separated by `1px var(--hairline)`; hover `rgba(255,255,255,0.03)`; no zebra, no per-row cards, no rounded rows. Right-align numeric/timestamp columns.
- **Code blocks:** `ui-code-shell` with label bar + copy button, `--radius-md` (5–6px), mono `0.82rem / 1.5`. Label bar uses uppercase or filename-style label. No drop shadow on inline code blocks within prose; only the floating hero/demo blocks get lift.
- **Metadata rows (the signature component):** `grid-template-columns: <fixed-label-col> 1fr`, uppercase mono label (`600`, muted, `0.06–0.08em`), mono value (`400`, text). This is the workhorse — every "what the system sees" block uses it. Density: `6–8px` row gap. This component, more than any other, is what makes the product read as operator-grade.

---

## 7. Section-by-section rating (`app/page.tsx`)

| Section | JSX anchor | Rating | Notes |
|---|---|---|---|
| **Announcement bar** | `announcement-bar` | ✓ good | Functional copy, de-pulsed dot, 1px accent border. Exemplary restraint. |
| **Hero — content** | `home-hero__content` | ✓ good | H1 at `-0.04em/820`, mono permission examples with `—` prefix, stats as divider-separated bottom-aligned values. Operator-grade. |
| **Hero — terminal visual** | `hero-terminal` | ⚠ needs tightening | Excellent metadata-row instrument, BUT: (a) `LIVE` badge infinite pulse → de-pulse (AP-6); (b) raw color literals are fine here only because aria-hidden. Otherwise the strongest component on the page. |
| **Flow section** | `home-flow-section` | ⚠ needs tightening | Remove the decorative vertical indigo wash (AP-3). Centered layout tolerable for an explanatory diagram band. The `fd-wrap` terminal itself is good. |
| **How it works / steps** | `home-steps` / `home-step` | ✓ good | Two-column step + typed visual card with semantic left-border is exactly the target pattern. Scroll-reveal correctly motion-gated. Keep. |
| **Integration / code** | `home-code` | ✓ good | "Three lines between request and execution." + real TS snippet. The simple-mode flow diagram is now SVG (emoji removed per page-fixes). Clean. |
| **Deploy approvals** | `home-deploy` | ✓ good | Numbered sequence with mono register numbers, real CLI + "what the agent sees" block. Honest, dense, infrastructure-specific. |
| **Interactive demo** | `home-demo` | ✓ good | Three-column request→gateway→decision console with semantic decision panel. `border-inline` gateway is the model column separator. Emoji removed. Keep — but the console radius rule (8px) applies if reused. |
| **Final CTA** | `home-cta` | ⚠ needs tightening | The one genuinely "generic SaaS" moment: centered kicker + H2 + centered button row. Copy is good and honest. Consider left-aligning to match the operator grid; at minimum keep it minimal — no added gradient or glow here. |
| **(System-wide) dashboard/console h1** | n/a — `globals.css:516` | ✗ replace | Fluid `clamp(…,4.2rem)` on product page titles. Must become fixed rem. Not on `page.tsx` but the highest-priority type fix in the system. |
| **(System-wide) sandbox decision-console** | n/a — `globals.css:5895` | ✗ replace | `16px` radius on an operator surface. Drop to `8px`. |

---

## 8. CSS change spec for design-system-agent

> Apply these to `app/globals.css`. Each is surgical — exact selector, exact new value. Do not refactor surrounding rules.

**CSS-1 · Fix fluid sizing on product-UI page titles (highest priority).**
`globals.css` ~line 513–518, selector `.ui-page-header h1, .dashboard-header h1, .console-header h1`:
```css
/* was: font-size: clamp(2.1rem, 4vw, 4.2rem); line-height: 1; */
font-size: 2rem;
line-height: 1.05;
```
Rationale: product UI uses a fixed rem scale; clamp display sizing is marketing-only. Matches the docs-h1 fix.

**CSS-2 · Drop sandbox decision-console radius to the product ceiling.**
`globals.css:5895`, selector `.sandbox-focus .decision-console`:
```css
/* was: border-radius: 16px; */
border-radius: var(--radius-lg); /* 8px */
```

**CSS-3 · Lower tour-card radius to the overlay ceiling.**
`globals.css:11332`, selector `.tour-card`:
```css
/* was: border-radius: 14px; */
border-radius: var(--radius-xl); /* 10px */
```

**CSS-4 · Remove the decoration-only section wash on the flow band.**
`globals.css:12718`, selector `.home-flow-section`:
```css
/* remove: background: linear-gradient(180deg, transparent 0%, rgba(99,102,241,0.03) 50%, transparent 100%); */
background: none;
border-top: 1px solid var(--border);
border-bottom: 1px solid var(--border);
```
Rationale: replace atmospheric fog with structural hairlines that bracket the diagram band.

**CSS-5 · De-pulse the LIVE badge (instrument, not casino).**
`globals.css:12506–12516`, selector `.hero-terminal__badge--live` — remove the infinite animation:
```css
/* remove: animation: live-pulse 2s ease-in-out infinite; */
/* keep the static green-on-tint badge; delete or leave @keyframes live-pulse unused */
```
If a single liveness ping is desired, gate it behind `@media (prefers-reduced-motion: no-preference)` and run it once (no `infinite`).

**CSS-6 · Standardize the `security-card` decorative top-edge to a neutral hairline.**
`.security-card` (two definitions, ~`1650` and `~11861` per page-fixes), the permanent `border-top: 2px solid rgba(99,102,241,0.3)`:
```css
/* was: border-top: 2px solid rgba(99, 102, 241, 0.3); */
border-top: 1px solid var(--border);
```
Rationale: a colored edge implies typed/active state in this system; a static indigo edge on every card dilutes that grammar. (If a featured-card accent is wanted, apply a 2px **left**-border to the featured card only.)

**CSS-7 · Lock the metadata-row tint↔border co-occurrence (defensive comment + no orphan tints).**
For `.home-step__visual--accent/--deny/--ok` and `.home-demo__decision--*`: confirm each tint gradient is always paired with its 2px semantic left-border (currently true). Add a `/* tint requires matching left-border — never orphan */` comment above the block so the rule survives future edits. No value change; this is a guardrail.

**CSS-8 · (Optional) Normalize raw surface literal in console empty-state to tokens.**
If `.console-empty-state` (per product pass) uses `background: rgba(10,10,10,0.56)`, replace with `background: var(--panel);` so product surfaces stay on the token system (AP-7).
