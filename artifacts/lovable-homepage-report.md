# Lovable homepage port — final report

**Status:** READY WITH DOCUMENTED LIMITATIONS  
**Branch:** `cursor/lovable-homepage-port-7b82`  
**Date:** 2026-08-02

---

## 1. Why the legacy homepage appeared to remain

### Render-chain audit (PR #164 / this branch)

On `feature/lovable-ui-marketing` (and this follow-up), `/` was **already** mounting `LovableHomeContent` — a structural port of Lovable `src/routes/index.tsx`. Legacy section components (`HeroAuthorizationDemo`, `TrustStrip`, `ProblemSection`, etc.) were **not** imported by the live path.

What caused the “still legacy” perception:

1. **Production (`main`) still serves the legacy homepage** (`HeroAuthorizationDemo` + verification table + “Start securing agents”). Anyone opening behalfid.com sees the old page until this lands.
2. **Vercel preview is SSO-gated**, so reviewers often cannot open the branch preview and fall back to production.
3. **Naming confusion:** the shell lived at `components/marketing-v2/MarketingHomePage.tsx` next to the legacy section files, looking like the old composition even though it only wrapped `LovableHomeContent`.
4. **Earlier CSS regression** (`max-w-7xl → 22ch`) made the Lovable page look broken / unrecognizable before `25582b0`.
5. **Marketing header still showed Google** (“Continue with Google”), a legacy chrome cue absent from Lovable.

This follow-up removes those ambiguities and hardens regression tests so `/` cannot silently revert to the legacy hero.

---

## 2. Render chain

### Before (main / production)

```
app/page.tsx
  → marketing-v2/MarketingHomePage
    → MarketingNavbar
    → HeroAuthorizationDemo   ← legacy split hero + verification table
    → TrustStrip
    → ProblemSection
    → ProductShowcase
    → EnterpriseGovernance
    → FinalCTA
    → marketing-v2/MarketingFooter
```

### After (this branch)

```
app/layout.tsx  (+ lovable-design-system.css, lovable-utilities.css)
app/page.tsx / app/[locale]/page.tsx
  → components/marketing/MarketingHomePage.tsx
    → design-system/MarketingLayout (.ds)
      → MarketingHeader          (Lovable nav)
      → main#main-content
          → LovableHomeContent   (port of Lovable index.tsx)
      → MarketingEnding          (final CTA)
      → MarketingFooter
```

`components/marketing-v2/MarketingHomePage.tsx` is now a **compat re-export only** and cannot revive the legacy composition.

---

## 3. Legacy components removed from `/`

Disconnected from the live path (files retained if unused elsewhere / for reference):

| Component | On `/`? |
|---|---|
| HeroAuthorizationDemo | No |
| TrustStrip | No |
| ProblemSection | No |
| ProductShowcase | No |
| EnterpriseGovernance | No |
| FinalCTA | No |
| MarketingNavbar / MarketingNavbarClient | No |
| marketing-v2/MarketingFooter | No |

Also removed from marketing chrome: **Continue with Google** (OAuth remains on `/login` / `/signup`).

---

## 4. Lovable components ported

| Lovable source | Next.js destination | Port status |
|---|---|---|
| marketing-layout Header | MarketingHeader | adapted (Next Link, production routes, Blog, locale/theme, auth Dashboard label) |
| index Hero | LovableHomeContent (hero section) | exact content/structure |
| AuthorityFlowCanvas | design-system/marketing-visuals | adapted (ds-* utilities, client) |
| Adaptive / LearningTimeline / Modes | design-system/adaptive-visuals | adapted |
| IdentityCanvas | marketing-visuals | adapted |
| PermissionBoundaries | marketing-visuals | adapted |
| ApprovalSequence | marketing-visuals | adapted |
| DashboardShowcase | marketing-visuals | adapted |
| Developers + CodeTabs | LovableHomeContent + design-system/code | adapted (`/docs/quickstart`) |
| Security dl | LovableHomeContent | exact Lovable 4-item copy |
| MarketingEnding | MarketingLayout.MarketingEnding | exact |
| Footer columns | MarketingFooter | adapted (production legal/docs links) |

---

## 5. Text / content differences corrected

- Dashboard CTA: **Open the console** (was “Open the dashboard”)
- Security list restored to Lovable’s four items (removed production-only “Managed profiles” / “Decision logs” labels from homepage)
- Homepage shell moved out of `marketing-v2/`
- Google CTA removed from marketing header
- Regression tests assert Lovable copy and ban legacy hero strings

---

## 6. Mobile comparison (390 / 430)

Verified via Playwright screenshots:

- Behalf/ID wordmark, Start building, hamburger
- `/ AUTHORITY FOR AI AGENTS` eyebrow
- Editorial headline with controlled line wrapping
- Supporting paragraph + full-width primary CTA + secondary beneath
- Authority-flow canvas after spacing
- No verification table / Google hero CTA / feature strip

Artifacts: `artifacts/lovable-parity/home-390x844.png`, `home-430x932.png`

---

## 7. Desktop comparison (1440 / 1536 / 1280)

- Lovable nav labels (no Enterprise)
- Editorial hero (not split finance-control)
- CTAs: Start building / See how it works
- Authority-flow canvas present and wide (fidelity script: 1216px @ 1440)
- No legacy Google / feature strip

Artifacts: `artifacts/lovable-parity/home-1440x900.png`, `home-1536x960.png`, `home-1280x800.png`

---

## 8. Section order

Matches Lovable `index.tsx`:

Hero → social proof → authority map → adaptive → evidence → editorial statement → identity → permissions → approvals → dashboard → developers → security → ending CTA → footer

---

## 9. Regression tests

- `test/lovable-homepage-regression.test.ts` — requires Lovable copy; bans legacy hero strings; asserts section order and AuthorityFlowCanvas
- Existing fidelity / phase2 tests updated for new shell path
- Runtime: `scripts/dev/lovable-homepage-parity.mjs` — **133/133** viewport content checks
- `scripts/phase2-hero-fidelity-check.mjs` — **43/43**

---

## 10. Final head SHA

See `git rev-parse HEAD` on `cursor/lovable-homepage-port-7b82` after push.

---

## 11. Vercel preview / CI

Will update after PR creation. Prior PR #164 preview was SSO-gated; local production build of this branch is the visual source of truth used here.

---

## 12. CI status

Pending on new PR. Local: focused vitest **45 passed**, `tsc --noEmit` **0**, `npm run build` **EXIT:0**.

---

## 13. Screenshots

| Viewport | Path |
|---|---|
| 1536×960 | `artifacts/lovable-parity/home-1536x960.png` |
| 1440×900 | `artifacts/lovable-parity/home-1440x900.png` (+ full) |
| 1280×800 | `artifacts/lovable-parity/home-1280x800.png` |
| 1024×768 | `artifacts/lovable-parity/home-1024x768.png` |
| 768×1024 | `artifacts/lovable-parity/home-768x1024.png` |
| 430×932 | `artifacts/lovable-parity/home-430x932.png` |
| 390×844 | `artifacts/lovable-parity/home-390x844.png` (+ full) |

Also copied under `/opt/cursor/artifacts/lovable-parity/`.

---

## 14. Does `/` genuinely render the Lovable homepage?

**Yes.** Live HTML and screenshots show Lovable eyebrow, headline, CTAs, nav, authority-flow canvas, and section order. Legacy hero strings are absent from visible UI.

### Documented limitations

1. Production `main` still legacy until merge.
2. Preview SSO may block external visual review.
3. Header includes production locale switcher + theme toggle (not in Lovable source).
4. Footer keeps production legal/docs links.
5. Cookie banner / skip link are production chrome.
6. Developers quickstart points to `/docs/quickstart` (not Lovable `/docs-preview`).
