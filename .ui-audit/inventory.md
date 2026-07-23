# BehalfID UI Audit — Route Inventory
_Generated: Phase 1 — repo-inventory-agent_

## Tech stack
- Next.js 16 (App Router), React 19
- Pure CSS (no Tailwind) — `app/globals.css` (12,722 lines)
- CSS custom properties design token system
- Inter (sans) + JetBrains Mono (code) from Google Fonts
- Dark-first (`data-theme="dark"` default), light theme via `[data-theme="light"]`
- i18n: next-intl with `[locale]` route group (en/de/es/fr)
- `components/ui/` — shared UI primitives
- `components/layout/` — shared layout shells

---

## Layout shells (shared — highest impact)

| File | Purpose | Risk to edit |
|---|---|---|
| `components/layout/PublicNav.tsx` | Marketing site nav with hamburger drawer | Medium |
| `components/layout/PublicFooter.tsx` | Marketing site footer | Low |
| `components/layout/DashboardShell.tsx` | Dashboard sidebar + mobile drawer | High |
| `components/layout/ConsoleShell.tsx` | Admin console sidebar | High |
| `components/layout/DocsLayout.tsx` | Docs sidebar + search + mobile drawer | High |
| `app/layout.tsx` | Root layout (fonts, theme script) | High |
| `app/globals.css` | All CSS — design tokens, components, pages | Very High |

---

## UI Primitives (shared — high impact)

| File | Class | Notes |
|---|---|---|
| `components/ui/Button.tsx` | `.ui-button`, `.ui-button--{primary,secondary,danger,ghost}` | Haptic feedback included |
| `components/ui/Card.tsx` | `.ui-card` | Minimal wrapper |
| `components/ui/Badge.tsx` | `.ui-badge`, `.ui-badge--{allow,deny,warn}` | Decision semantics |
| `components/ui/Input.tsx` | `.ui-input` | |
| `components/ui/CodeBlock.tsx` | `.ui-code-shell`, `.ui-code-bar`, `.ui-code` | Label + copy button |
| `components/ui/EmptyState.tsx` | `.ui-empty` | Minimal — needs improvement |
| `components/ui/Table.tsx` | `.ui-table` | |
| `components/ui/PageHeader.tsx` | `.ui-page-header` | |
| `components/ui/Logo.tsx` | `.site-logo` | Symbol + wordmark variants |
| `components/ui/ThemeToggle.tsx` | `.theme-toggle` | |
| `components/ui/ModeToggle.tsx` | `.mode-toggle` | Simple/Advanced mode switcher |
| `components/ui/StatCard.tsx` | `.ui-stat` | |
| `components/ui/Tabs.tsx` | `.ui-tabs` | |

---

## Routes — Marketing / Public

| Route | File | Category | Visual audit | Copy polish | Responsive risk | Priority |
|---|---|---|---|---|---|---|
| `/` | `app/page.tsx` | Marketing — homepage | Yes | Yes | High | Critical |
| `/blog` | `app/blog/page.tsx` | Marketing — blog index | Yes | Low | Medium | Medium |
| `/blog/[slug]` | `app/blog/[slug]/page.tsx` | Marketing — blog post | Yes | Yes | Medium | Medium |
| `/status` | `app/status/page.tsx` | Marketing — status | Yes | Low | Low | Medium |
| `/security` | `app/security/page.tsx` | Marketing — security | Yes | Yes | Low | Medium |
| `/compliance` | `app/compliance/page.tsx` | Marketing — compliance | Yes | Yes | Low | Low |
| `/privacy` | `app/privacy/page.tsx` | Legal — privacy policy | Low | Low | Low | Low |
| `/terms` | `app/terms/page.tsx` | Legal — terms | Low | Low | Low | Low |
| `/legal` | `app/legal/page.tsx` | Legal — legal hub | Low | Low | Low | Low |
| `/design-partners` | `app/design-partners/page.tsx` | Marketing — partners | Yes | Yes | Low | Low |
| `/sandbox` | `app/sandbox/page.tsx` | Interactive — sandbox | Yes | Medium | Medium | High |
| `/passport/[agentId]` | `app/passport/[agentId]/page.tsx` | Product — public passport | Yes | Low | Medium | Medium |
| `/authenticate` | `app/authenticate/page.tsx` | Auth flow | Yes | Low | Low | Medium |

---

## Routes — Auth

| Route | File | Category | Visual audit | Copy polish | Responsive risk | Priority |
|---|---|---|---|---|---|---|
| `/login` | `app/login/page.tsx` | Auth | Yes | Low | Low | High |
| `/signup` | `app/signup/page.tsx` | Auth | Yes | Low | Low | High |
| `/forgot-password` | `app/forgot-password/page.tsx` | Auth | Yes | Low | Low | Medium |
| `/reset-password` | `app/reset-password/page.tsx` | Auth | Yes | Low | Low | Medium |
| `/verify-email` | `app/verify-email/page.tsx` | Auth | Yes | Low | Low | Medium |
| `/onboarding` | `app/onboarding/page.tsx` | Onboarding | Yes | Yes | Medium | High |

---

## Routes — Dashboard (developer portal, auth-gated)

| Route | File | Category | Visual audit | Copy polish | Responsive risk | Priority |
|---|---|---|---|---|---|---|
| `/dashboard` | `app/dashboard/page.tsx` | Product — overview | Yes | Low | Medium | Critical |
| `/dashboard/agents` | `app/dashboard/agents/page.tsx` | Product — agents list | Yes | Low | Medium | Critical |
| `/dashboard/agents/[agentId]` | `app/dashboard/agents/[agentId]/page.tsx` | Product — agent detail | Yes | Low | Medium | High |
| `/dashboard/logs` | `app/dashboard/logs/page.tsx` | Product — audit logs | Yes | Low | Medium | High |
| `/dashboard/approvals` | `app/dashboard/approvals/page.tsx` | Product — approvals | Yes | Low | Medium | High |
| `/dashboard/webhooks` | `app/dashboard/webhooks/page.tsx` | Product — webhooks list | Yes | Low | Low | Medium |
| `/dashboard/webhooks/[webhookId]` | `app/dashboard/webhooks/[webhookId]/page.tsx` | Product — webhook detail | Yes | Low | Low | Medium |
| `/dashboard/billing` | `app/dashboard/billing/page.tsx` | Product — billing | Yes | Low | Low | High |
| `/dashboard/settings` | `app/dashboard/settings/page.tsx` | Product — settings | Yes | Low | Low | Medium |
| `/dashboard/onboarding` | `app/dashboard/onboarding/page.tsx` | Product — onboarding | Yes | Yes | Medium | High |
| `/dashboard/sites` | `app/dashboard/sites/page.tsx` | Product — site guard | Yes | Low | Medium | Medium |
| `/dashboard/docs` | `app/dashboard/docs/page.tsx` | Product — in-app docs | Yes | Low | Low | Low |

---

## Routes — Console (internal admin, auth-gated)

| Route | File | Category | Visual audit | Copy polish | Responsive risk | Priority |
|---|---|---|---|---|---|---|
| `/console` | `app/console/page.tsx` | Admin — overview | Yes | Low | Low | High |
| `/console/agents` | `app/console/agents/page.tsx` | Admin — agents | Yes | Low | Low | High |
| `/console/agents/[agentId]` | `app/console/agents/[agentId]/page.tsx` | Admin — agent detail | Yes | Low | Low | Medium |
| `/console/logs` | `app/console/logs/page.tsx` | Admin — logs | Yes | Low | Low | High |
| `/console/site-guard` | `app/console/site-guard/page.tsx` | Admin — site guard | Yes | Low | Low | Medium |
| `/console/webhooks` | `app/console/webhooks/page.tsx` | Admin — webhooks | Yes | Low | Low | Medium |
| `/console/webhook-events` | `app/console/webhook-events/page.tsx` | Admin — events | Yes | Low | Low | Medium |
| `/console/status` | `app/console/status/page.tsx` | Admin — status mgmt | Yes | Low | Low | Medium |
| `/console/settings` | `app/console/settings/page.tsx` | Admin — settings | Yes | Low | Low | Low |
| `/console/enterprise-inquiries` | `app/console/enterprise-inquiries/page.tsx` | Admin — inquiries | Yes | Low | Low | Low |
| `/console/login` | `app/console/login/page.tsx` | Admin — login | Yes | Low | Low | High |

---

## Routes — Docs

| Route | File | Category | Visual audit | Copy polish | Responsive risk | Priority |
|---|---|---|---|---|---|---|
| `/docs` | `app/docs/page.tsx` | Docs — overview | Yes | Yes | Medium | High |
| `/docs/quickstart` | `app/docs/quickstart/page.tsx` | Docs — quickstart | Yes | Medium | Medium | High |
| `/docs/cli` | `app/docs/cli/page.tsx` | Docs — CLI reference | Yes | Low | Medium | Medium |
| `/docs/api` | `app/docs/api/page.tsx` | Docs — API reference | Yes | Low | Medium | High |
| `/docs/sdk` | `app/docs/sdk/page.tsx` | Docs — SDK reference | Yes | Low | Medium | High |
| `/docs/action-gateway` | `app/docs/action-gateway/page.tsx` | Docs — Action Gateway | Yes | Medium | Medium | Medium |
| `/docs/webhooks` | `app/docs/webhooks/page.tsx` | Docs — Webhooks | Yes | Low | Medium | Medium |
| `/docs/site-guard` | `app/docs/site-guard/page.tsx` | Docs — Site Guard | Yes | Medium | Medium | Medium |
| `/docs/concepts` | `app/docs/concepts/page.tsx` | Docs — Concepts | Yes | Yes | Medium | Medium |
| `/docs/deploy-approvals` | `app/docs/deploy-approvals/page.tsx` | Docs — Deploy approvals | Yes | Yes | Medium | High |
| `/docs/demo-script` | `app/docs/demo-script/page.tsx` | Docs — Demo script | No | Low | Low | Low |

---

## Routes — Design System (internal reference)

| Route | File | Category | Priority |
|---|---|---|---|
| `/design-system` | `app/design-system/page.tsx` | Internal | Low |
| `/design-system/brand` | `app/design-system/brand/page.tsx` | Internal | Low |
| `/design-system/colors` | `app/design-system/colors/page.tsx` | Internal | Low |
| `/design-system/typography` | `app/design-system/typography/page.tsx` | Internal | Low |
| `/design-system/components` | `app/design-system/components/page.tsx` | Internal | Low |
| `/design-system/patterns` | `app/design-system/patterns/page.tsx` | Internal | Low |
| `/design-system/characteristics` | `app/design-system/characteristics/page.tsx` | Internal | Low |

---

## Directory summary

| Directory | Contents | Risk level |
|---|---|---|
| `app/` | Root layout, globals.css, all routes | Very High |
| `app/[locale]/` | i18n route mirrors (en/de/es/fr) — auto-derived | Low (don't edit directly) |
| `components/ui/` | All shared UI primitives | High |
| `components/layout/` | All shell/nav components | High |
| `lib/` | Utilities (haptic, auth, etc.) | Low |
| `styles/` | (not present — all CSS in globals.css) | N/A |
| `public/` | Static assets | Low |
| `packages/sdk/` | JS SDK | Do not touch |
| `packages/cli/` | CLI | Do not touch |

---

## Key design system issues identified (pre-audit)

1. **Badge semantics**: `.console-status--allowed` and `.console-status--active` use indigo brand color — should use `--ok` (green) for correct permission system semantics
2. **Danger button**: Uses indigo colors — should use red/`--deny` for destructive actions
3. **Pending/processing badges**: Share same muted grey as denied/error — should be amber/`--warn`
4. **Empty states**: `min-height: 76px` — too sparse, needs more structure
5. **globals.css size**: 12,722 lines — likely has dead rules from iteration
6. **Duplicate selector lists**: Many long comma-separated rules — consolidation opportunity

---

## Execution sequence

1. ✅ Phase 0 — Safety + branch (`ui-system-correction`)
2. ✅ Phase 1 — Inventory (this file)
3. 🔄 Phase 2 — Design system audit + fixes (design-system-agent)
4. 🔄 Phase 3 — Playwright visual baseline (playwright-visual-auditor)
5. ⏳ Phase 4 — Page-by-page corrections (marketing, product, docs agents)
6. ⏳ Phase 5–7 — Marketing / Product / Docs specialist passes
7. ⏳ Phase 8 — Accessibility + responsive QA
8. ⏳ Phase 9 — Regression + build
9. ⏳ Phase 10 — Final visual review + report
