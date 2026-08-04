# Lovable → production UI integration matrix

Visual source: `BehalfID/agent-gatekeeper-suite` (TanStack Start, Tailwind 4)  
Production target: `BehalfID/behalf` (Next.js 16 App Router, custom CSS, custom auth)

**Direction:** frontend presentation port only. Production remains source of truth for auth, sessions, APIs, schema, billing, verification, analytics, status probes, SDK/CLI/MCP, env, and Vercel.

---

## Status

**READY WITH DOCUMENTED LIMITATIONS** (Phase 2 marketing cutover)

Hard blockers: none. Phase 1 foundation remains; Phase 2 activates public marketing under `.ds`. Soft limitations in §12.

---

## 1. Design-system files to port

| Lovable source | Production destination | Strategy |
| -------------- | ---------------------- | -------- |
| `DESIGN_SYSTEM.md` | `docs/DESIGN_SYSTEM.md` | Adapt paths; keep motif, env, motion, claim hygiene |
| `src/styles.css` (`@theme`, envs, motion) | `app/lovable-design-system.css` | Translate Tailwind `@theme`/`@utility` → plain CSS; scope opt-in via `.ds` where needed |
| `PAGE_INVENTORY.md` / `COMPONENT_INVENTORY.md` / `INTEGRATION_NOTES.md` | This matrix + notes | Reference only; do not port scaffolding |
| `src/hooks/use-motion.ts` | `hooks/use-motion.ts` | Direct port (no Framer) |
| `src/components/behalf/motion.tsx` | `components/design-system/motion.tsx` | CSS classes instead of Tailwind utilities |
| `src/components/behalf/brand.tsx` | `components/design-system/brand.tsx` | Next.js `Link`; coexist with `components/ui/Logo` until cleanup |
| `src/components/behalf/theme.tsx` | Keep `lib/theme.ts` + `ThemeToggle` | Bridge `.dark` ↔ `data-theme`; do **not** adopt Lovable `behalfid-theme` storage key |
| `src/components/behalf/{marketing,adaptive}-visuals.tsx` | Phase 2 | Port visuals; keep Illustrative/Beta tags |
| `src/components/behalf/primitives.tsx` | Restyle `components/ui/*` | Prefer production a11y/behavior; Lovable look |
| `src/components/ui/*` (shadcn) | Do **not** dual-install | Map to existing Button/Input/Card/Table/Overlay |
| Instrument Sans + JetBrains Mono | `app/layout.tsx` `next/font` | Replace Inter with Instrument Sans; keep JetBrains Mono |
| Copper oklch palette | Lovable CSS tokens + existing `--accent-base: #d88a63` | Align; no purple rewrite |

---

## 2. Production components to replace or restyle

| Production | Action |
| ---------- | ------ |
| `components/marketing-v2/*`, `app/home-v2`, `app/page.tsx` | Phase 2: replace presentation with Lovable marketing |
| `PublicNav*` / `PublicFooter` / `MarketingNavbar*` | Phase 1: ship design-system shells; Phase 2: cut over IA + visuals |
| `components/ui/Logo` | Restyle toward Wordmark slash motif; keep Image mark until brand decision |
| `components/ui/Button`, `Input`, `Card`, `Table`, `Overlay`, `Feedback`, `EmptyState`, `LoadingStates`, `StatCard`, `PageHeader`, `Badge`, `Tabs` | Restyle in place across later phases; single system |
| Auth pages (`login`, `signup`, `complete-profile`, reset/verify) | Phase 3: presentation only |
| `DashboardShell`, dashboard pages | Phases 4–6 |
| `ConsoleShell`, console pages | Phase 7 |
| Status page UI | Phase 2 visual; keep `/api/status` + health probes |

---

## 3. Components / systems that stay functionally unchanged

- Custom auth (password, Google, GitHub, passkeys, MFA, SSO, reauth proofs)
- HttpOnly sessions, OAuth PKCE/state, WebAuthn RP/origin
- All `app/api/**` routes and server actions
- Drizzle schema / Supabase Postgres ownership
- Verification, approvals, permissions, agents, tokens, webhooks
- Billing/Stripe checkout, portal, webhooks, entitlements
- Console analytics semantics (UTC, shadow vs enforced, zero-fill)
- Status health probes
- Subdomain routing (`www`, `auth`, `app`, `console`, `docs`)
- Locale / next-intl
- SEO metadata, sitemap, structured data (update copy only when factual)
- SDK / CLI / MCP packages

---

## 4. Route-by-route UI mapping

### Marketing

| Surface | Lovable | Production route | Data / notes | Risk |
| ------- | ------- | ---------------- | ------------ | ---- |
| Homepage | `routes/index.tsx` | `app/page.tsx`, `home-v2`, `marketing-v2` | SEO + real auth CTAs; mock demos → Illustrative or real | Med |
| Adaptive engine | `adaptive-engine.tsx` | `app/adaptive-engine` | Beta/In development; Illustrative patterns; no fake enforcement | Med |
| Pricing | `pricing.tsx` | `app/pricing` | Free/Pro/Enterprise from `lib/plans.ts`; no fake $99 Team | Med |
| Security | `security.tsx` | `app/security` | Keep factual security claims; Lovable chrome via PublicNav | Low |
| Blog | `blog.*` | `app/blog` | Existing CMS/content; Lovable chrome via PublicNav | Low |
| Contact | `contact.tsx` | `app/contact` | Posts to `/api/billing/enterprise-inquiry` | Low |
| Status | `status.tsx` | `app/status` + `/api/status` | **Keep probes**; Lovable visuals only | High if mocks slip in |
| Docs preview | `docs-preview.tsx` | Prefer `app/docs` / quickstart | Do not replace docs host | Low |
| Header / Footer | `marketing-layout.tsx` | `PublicNav*`, `PublicFooter`, marketing nav | Preserve subdomain + auth actions | Med |
| CTA sections | layout ending | `FinalCTA`, footer | Copy hygiene for adaptive | Low |

### Authentication

| Surface | Lovable | Production | Porting |
| ------- | ------- | ---------- | ------- |
| Login / Signup | `login.tsx`, `signup.tsx` | `app/login`, `app/signup` + APIs | UI only; wire existing handlers |
| Complete profile | (limited) | `app/complete-profile`, `app/auth/complete-profile` | Keep flows |
| Forgot / reset | — | `forgot-password`, `reset-password` | Restyle |
| Verify email | — | `verify-email` | Restyle |
| OAuth errors | — | existing auth error UI | Keep behavior |
| Passkey / MFA / SSO / linked methods | — | dashboard settings + auth APIs | Presentation in Phases 3/6 |
| Account deletion reauth | — | production reauth proofs | Never weaken |

### Dashboard

| Surface | Lovable | Production | Data |
| ------- | ------- | ---------- | ---- |
| Shell | `dashboard-shell.tsx` (unrouted) | `DashboardShell`, `dashboard-shell.css` | Real session/workspace |
| Overview | mock shells | `app/dashboard` + `/api/dashboard/summary` | Real counts only |
| Agents / detail | mock | `dashboard/agents` + APIs | Real |
| Permissions / detail | mock | permission pages + APIs | Real |
| Approvals / detail | mock | `approvals` + APIs | Real |
| Activity | mock | `logs` / inbox | Real |
| Managed profiles | — | `managed-profiles` | Real |
| Integrations / tokens / usage | — | existing routes | Real |
| Members / settings / auth methods | — | settings + MFA/SSO APIs | Real |
| Billing | mock | `billing` + Stripe | Real; no fake invoices |
| Danger zone | — | settings | Keep reauth |
| Adaptive delegation | proposed `/dashboard/adaptive` | `adaptive-delegation` | Real recommendations; Beta labels |

### Console

| Surface | Lovable | Production | Data |
| ------- | ------- | ---------- | ---- |
| Shell | `console-shell.tsx` | `ConsoleShell` | Admin session |
| Overview / analytics | mock | `console` + `/api/console/analytics` | Corrected UTC semantics |
| Users / workspaces / agents | mock / absent | console agents + APIs | Real |
| Verifications / system / audit | partial | logs, status, webhook-events | Real |

---

## 5. Mock → real data mapping

| Lovable mock (`src/lib/mock/*`) | Production source | Rule |
| ------------------------------- | ----------------- | ---- |
| Dashboard metrics / outcome mix | `/api/dashboard/summary`, agents, approvals, logs | No fabricated trends |
| Pattern cards / confidence % | adaptive-delegation APIs or omit | Keep Illustrative until real |
| Status uptime / incidents | `/api/status`, health probes | Never replace with mock |
| Pricing / invoices | Stripe + entitlements | No fake invoices |
| Auth session user | custom session `/api/auth/me` | Never localStorage JWT |
| Contact form | new server action or existing inquiry | No client-only fake success |
| Console analytics | `/api/console/analytics` | Preserve bucket semantics |

Adapters/view-models allowed when Lovable components expect different shapes. **Do not** change API contracts merely to match mocks.

---

## 6. Dependency changes

| Change | Decision |
| ------ | -------- |
| Tailwind 4 / TanStack Start / Nitro | **Do not add** |
| Framer Motion / GSAP | **Do not add** (CSS + hooks) |
| lucide-react | Optional later; Phase 1 uses inline SVG / existing icons |
| clsx / tailwind-merge | Tiny `lib/cn.ts` only |
| Lovable Supabase client / Auth / `.env` | **Forbidden** |
| Instrument Sans via `next/font` | **Add** (Phase 1) |

---

## 7. Risk areas

1. **Dual CSS worlds** — large `globals.css` + Lovable tokens; avoid fighting body theme.
2. **Theme bridge** — production `data-theme` + Lovable `.dark` must stay synced.
3. **Light-first marketing vs dark-first app** — migrate marketing under `.ds` carefully.
4. **Claim hygiene** — adaptive Observe/Recommend/Enforce must stay Beta/Illustrative until enforced.
5. **Status honesty** — visual polish must not invent green/uptime.
6. **Auth presentation** — never show password UI without password identity.
7. **Missing routes** — `/pricing`, `/adaptive-engine`, `/contact` added in Phase 2.
8. **Hydration** — motion + theme scripts must remain SSR-safe.
9. **Duplicate primitives** — must converge Button/Dialog/Table/Toast systems by Phase 8.
10. **i18n** — Lovable is English-first; preserve next-intl keys when cutting over nav.

---

## 8. Phase-by-phase commit plan

1. **Phase 1** — tokens, typography, theme bridge, motion, brand primitives, design-system header/footer shells, matrix docs  
2. **Phase 2** — marketing pages + status visual layer; add missing public routes  
3. **Phase 3** — auth presentation wired to real flows  
4. **Phase 4** — app shell (sidebar, workspace switcher, command menu)  
5. **Phase 5** — overview, agents, permissions, approvals, activity  
6. **Phase 6** — settings, members, integrations, tokens, usage, billing, danger zone, profiles, adaptive  
7. **Phase 7** — console  
8. **Phase 8** — remove obsolete UI, mocks, duplicates; a11y/perf/visual regression; full test suite  

---

## 9. Expected first PR scope (this branch)

- `docs/UI_INTEGRATION_MATRIX.md`, `docs/DESIGN_SYSTEM.md`
- `app/lovable-design-system.css` + layout import
- Instrument Sans + theme `.dark` sync
- `lib/cn.ts`, `hooks/use-motion.ts`, `components/design-system/*`
- Design-system MarketingHeader/Footer (exported; not forced onto all public pages until Phase 2 routes exist)
- No DNS, schema, env, or deploy changes
- No Lovable Supabase / TanStack / Nitro

---

## 10. Blockers

**None hard.** Limitations: Tailwind→CSS translation; missing public routes for full nav cutover; dual theme attribute systems bridged in Phase 1; deliberate Instrument Sans font normalization is global.

---

## 11. Phase 1 validation findings

### Critical fixes applied

1. **Token collision:** Initial CSS port redefined production `:root` tokens (`--muted`, `--border`, `--surface-2`, `--background`, `--radius-*`, `--shadow-subtle`) and applied Lovable dark overrides on bare `.dark` / `html[data-theme="dark"]`. That would have restyled dashboard/auth/console surfaces.  
   **Mitigation:** all Lovable color/radius/shadow tokens and generic utilities are scoped under `.ds` (with `--ds-*` internals).

2. **Font cascade:** Setting `--font-sans` only in `lovable-design-system.css` lost to `globals.css` after Next.js CSS chunk ordering.  
   **Mitigation:** Instrument Sans is set on `:root --font-sans` in `app/globals.css` (Inter remains fallback). Layout still registers `Instrument_Sans` via `next/font`.

### Opt-in

Wrap a route or subtree in `className="ds"` (or use a design-system shell that already includes `ds`). Nested utilities (`env-*`, `display-*`, `slash-seam`, `path-pulse`, `lift`) only apply inside `.ds`. Prefixed chrome (`ds-header`, `ds-reveal-*`, `ds-wordmark`) uses unique names.

### Theme sync

- Storage key remains production `theme` (not Lovable `behalfid-theme`).
- Boot script + `applyResolvedTheme()` set `data-theme` and toggle `html.dark`.
- Lovable dark register activates only as `html.dark .ds` / `html[data-theme="dark"] .ds` / `.ds.dark` / `.ds .dark`.

### Reduced motion

- CSS: `.ds *` and `ds-reveal-*` durations collapse under `prefers-reduced-motion`.
- JS: `usePrefersReducedMotion` forces `useSequence` / `<Reveal>` to final state.

### Safe Phase 2 primitives

`Wordmark`, `BrandMark`, `AgentAvatar`, `Reveal`, `IllustrativeTag`, `BetaTag`, `Section`, `SectionHeading`, `use-motion` hooks, `.ds` environments/motion utilities.  
`MarketingHeader` / `MarketingFooter` stay **exported only** until `/pricing`, `/adaptive-engine`, `/contact` exist.

### Live chrome (Phase 2)

`PublicNavClient` → `MarketingHeader`; `PublicFooter` → `MarketingFooter`. Homepage and new marketing routes use `MarketingLayout` (`.ds` + ending CTA). Auth/dashboard/console shells remain on the production design system.

### Known CSS collision risks (mitigated)

| Risk | Rule |
| ---- | ---- |
| Shared token names (`--muted` is text in prod, surface in Lovable) | Never assign Lovable meanings on `:root` |
| Generic utilities (`display-2xl`, `lift`) | Nest under `.ds` only |
| `html.dark` class | Must not redefine production tokens globally |
| Dual Button/Dialog systems | Restyle `components/ui/*`; do not install Lovable shadcn |

### Duplicate component systems

Do not add a second Button/Input/Dialog/Table/Toast stack. Phase 2+ applies Lovable presentation to existing production primitives.

### Visual regression (opt-in surfaces)

Non-`.ds` pages keep existing layout density, sticky nav, forms, and motion. Expected deliberate difference: Instrument Sans family via `--font-sans`. No new animations on pages that have not opted in.

Playwright harness: `node scripts/phase1-visual-check.mjs` (against a local production server). Validated homepage, login, signup, complete-profile, security, status, 404 across light/dark/system, 1440/1024/390, reduced motion — theme sync, no live `.ds`, no Lovable motion classes, no horizontal overflow, sticky public nav.

Dashboard/console authenticated screens were not exercised in the headless harness (session-gated); static boundary tests + production CSS scoping cover their non-opt-in stability.

---

## 12. Phase 2 validation findings

### Delivered

- Homepage cutover: `MarketingHomePage` → `MarketingLayout` + `LovableHomeContent` (editorial hero, copper path, adaptive modes, approval flow, dashboard preview, developer/security sections).
- New routes: `/pricing`, `/adaptive-engine`, `/contact` with metadata + sitemap entries.
- Public nav/footer cutover to design-system chrome; links limited to real production routes + subdomain-aware handlers.
- Pricing sourced from `PLAN_ENTITLEMENTS` / `PRO_PLAN_PRICE_CENTS` ($20 Pro); no fabricated Team tier.
- Contact posts to existing `/api/billing/enterprise-inquiry` (server-side email/storage; no client secrets).
- Adaptive page: “In development”, policy-first, Observe → Recommend → Enforce after admin enable; Illustrative/Beta tags.
- Motion: CSS + `use-motion` / `Reveal`; reduced-motion collapse retained under `.ds`.
- Utilities: `app/lovable-utilities.css` scoped under `.ds`, loaded after token layer.

### Limitations

- Blog/security/status/legal keep legacy page bodies; only chrome is Lovable-derived (header/footer carry `.ds`).
- New marketing routes have `[locale]` wrappers; copy remains English-first like Lovable.
- Status probes and StatusBoard UI unchanged (not a Lovable visual restyle of status content).
- Auth/dashboard/console not cut over (Phase 3+).
- Fidelity is verified against the **real running applications** (the Next.js target and, where available, the Lovable Vite source), not a reconstructed HTML fixture. `scripts/verify-marketing-grids.mjs` measures computed `grid-template-columns` for the marketing sections in Chromium + WebKit at desktop and mobile. The former synthetic `scripts/phase2-source-parity.mjs` and `scripts/fixtures/lovable-hero-source.html` fixture were removed.

### Critical fidelity fix (post-preview)

`.ds .max-w-7xl` was incorrectly set to `22ch` (intended for a display measure utility) instead of Tailwind’s `80rem`. That collapsed the hero shell so `display-2xl` wrapped one word per line. Restored `max-w-7xl` → `80rem`, added missing `max-w-{sm,md,lg,xl,4xl,5xl,6xl}`, fixed `left-0`, and restored Lovable’s `md` header breakpoint with nowrap Sign in / CTA.

### Hero CTA clipping / header density (parity pass)

- Missing `.ds` preflight (`h1`/`p` margin: 0) let UA margins (~56px below `h1`, ~18px below `p`) push CTAs to the fold — especially visible in Safari/WebKit at 1280×800.
- Missing `.ds .px-6` zeroed hero button horizontal padding; CTAs now match Lovable `Button size="lg"` (`h-10`, `text-sm`, `px-6`).
- Header: Blog mobile/footer-only; `DsAppearanceToggle` icon group replaces labeled theme switcher; locale globe without `EN` label; Google remains on login/signup (+ mobile drawer).

### Phase 3 (NOT in PR #164): Lovable auth UI inventory

Recorded for the next phase only — **no auth code was changed in PR #164**. Login,
signup, password reset, OAuth, passkeys, MFA, sessions and auth routes are untouched.

| Lovable source | Purpose | Port notes for Phase 3 |
| --- | --- | --- |
| `src/routes/login.tsx` | Login page | Visual/layout only. Uses `supabase.auth` — **must not** be ported; keep production custom auth (SimpleWebAuthn passkeys, `jose` sessions, `otpauth` MFA). |
| `src/routes/signup.tsx` | Signup page | Same: presentation only, keep production submit path. |
| `src/routes/[.]lovable.oauth.consent.tsx` | Lovable OAuth consent | Lovable-specific; **not** applicable to production OAuth. |
| `src/components/layouts/auth-layout.tsx` | Auth shell (wordmark, ThemeToggle, ShieldCheck trust strip) | Portable structure; adapt `@tanstack/react-router` Link → `next/link`, `lucide-react` → local `./icons`. |
| `src/components/ui/{button,input,label}.tsx` | Form primitives | Port the literal Tailwind classes (same approach as the marketing transplant). `Button` cva already mirrored for the header/ending CTAs. |
| `sonner` `toast` | Form feedback | Production has no `sonner`; map to the existing notification pattern. |
| `src/lib/safe-next.ts` | `?next=` redirect guard | Compare against production's existing redirect validation before reusing. |

Dependencies to **exclude**: `@supabase/supabase-js`, `sonner`, `@tanstack/react-router`.
