# BehalfID demo readiness report

**Status:** READY WITH LIMITATIONS  
**Branch:** `cursor/demo-ready-polish-7b82`  
**Date:** 2026-07-27

---

## 1. Verdict

The product is demo-ready for a customer / investor walkthrough covering signup → onboarding → agent creation → permissions → browser CLI allow/deny/approval → audit trail. Remaining limitations are noted below (self-approval policy, Next.js CSP nonce overlay in local dev, recording uses hybrid UI+API for reliability).

## 2. Root causes discovered

| Issue | Root cause | Fix |
|---|---|---|
| Duplicate dashboard sidebar | Nested `DashboardShellLayout` (layout + page wrappers) | Already fixed on `main` (PR #154). Verified single shell remains. |
| Nested landmark | Agent detail rendered `<main>` inside shell `<main>` | Replaced inner `<main>` with `<div class="agent-detail-content">`. |
| First-agent verify failed for demo actions | Gate/baseline `allowedActions` omitted the primary `action`, so `deploy_production` hit “not included in allowedActions” instead of the approval gate | Included primary actions in `allowedActions` in `lib/firstAgentSetup.ts`. |
| First-setup HTTP 500 on expected failures | Permission mutation errors always mapped to 500 | Preserve underlying 4xx; only unexpected failures return 500. |
| Uncaught create errors → framework 500 | No try/catch around `createDeveloperAgent` | Map duplicate key → 409, validation → 400. |
| No browser CLI | Missing product surface | Added `/dashboard/cli` + `/api/dashboard/cli/exec` executing real BehalfID commands (no OS shell). |
| Local signup without SMTP | `sendEmail` threw; verification email dropped | Dev fallback writes `.behalf/dev-email.log` when SMTP unset outside production. |
| Mojibake copy in dashboard | UTF-8 em dashes corrupted to `â€”` / `â€¦` | Restored proper punctuation in `app/dashboard/client.tsx`. |

## 3. Visual fixes

- Nested agent-detail `<main>` removed.
- Browser CLI page styling (terminal, presets, prompt, responsive).
- CLI nav item + icon in dashboard shell.
- Wide content variant for `/cli`.
- Dashboard mojibake em dashes / ellipses corrected.
- Cookie banner dismissed and dark theme forced during recording.

## 4. Functional fixes

- Dev email capture for verification codes.
- First-agent permission actions aligned with verify semantics (allow / deny / approval-required).
- End-to-end path validated with a fresh account via API + Playwright recording.

## 5. Agent creation fixes

- `POST /api/dashboard/agents/first-setup`: expected permission failures → 4xx + `SETUP_FAILED`; rollback retained.
- `POST /api/dashboard/agents` and first-setup: duplicate key → 409; mongoose validation → 400.
- Tests updated (`test/first-agent-setup.test.ts`).

## 6. CLI implementation summary

- **UI:** `components/dashboard/BrowserCliTerminal.tsx` — history, copy, clear, presets, scrollback, loading.
- **API:** `POST /api/dashboard/cli/exec` (session auth) — parses/executes BehalfID commands against workspace data and `verifyAction`.
- **Parser:** rejects bash/powershell/cmd/node/python/curl/filesystem and shell operators.
- **Supported:** help, doctor, whoami, agents list/show, permissions list, verify, logs, config get/set, clear.
- **Routes:** `/dashboard/cli` and workspace-scoped equivalent; nav entry “CLI terminal”.

## 7. Recording summary

- Tooling: Playwright video → ffmpeg H.264 `artifacts/demo.mp4`.
- Flow: homepage → signup → verify → onboarding → create agent → agent detail/permissions → CLI (list, allow, deny, approval) → lead approve → retry verify → audit logs → activity → home.
- Narration: silent video + `artifacts/demo-script.md`.

## 8. Artifact locations

| Artifact | Path |
|---|---|
| Demo video | `artifacts/demo.mp4` (also copied to `/opt/cursor/artifacts/demo.mp4`) |
| Narration script | `artifacts/demo-script.md` |
| This report | `artifacts/demo-report.md` |
| Screenshots | `artifacts/screenshots/*.png` (24 frames) |
| Recording meta | `artifacts/demo-recording-meta.json` |
| Duration | ~2.6 minutes (157.6s) — re-recorded after CLI header / mojibake polish |

## 9. Tests executed

- `vitest` unit suite: **1690 passed**, 5 skipped; **1 failed** pre-existing (`test/cli-standalone-version.test.ts` requires Bun on Linux — environment limitation, unrelated to this work).
- Focused (final): `test/browser-cli-parse.test.ts`, `test/first-agent-setup.test.ts`, `test/dashboard-shell.test.tsx` — **28 passed**.
- Manual/API walkthrough: signup, verify, onboarding, first-setup, CLI allow/deny/approval, lead approve, re-verify.

## 10. Production build

- `npm run build` — **success** (EXIT:0). CLI routes present under `/dashboard/cli` and `/workspace/[workspaceSlug]/dashboard/cli`.

## 11. Git branch

`cursor/demo-ready-polish-7b82` → PR https://github.com/BehalfID/behalf/pull/155

## 12. Commits

```text
ef0523c Make BehalfID demo-ready with browser CLI and agent-create fixes.
20be2d3 Assert CLI dashboard route uses the wide content variant.
6eec8db Polish demo artifacts: mojibake, CLI header, recording script.
46034fb Re-record product demo after CLI and copy polish.
```

## 13. Remaining limitations

1. **Self-approval is intentionally blocked** even for OWNER — demo uses a second Engineering Lead (product-correct; not a bug).
2. **Next.js “Issues” overlay** in local `next dev` (CSP nonce hydration / Fast Refresh noise) — does not appear in production build surfaces the same way; avoid showing the badge in edited cuts if present.
3. **Recording automation** completes multi-step onboarding/agent create via API after showing the UI, for reliability under headless Chrome.
4. **Home skeleton** can still flash briefly on cold navigations; recording waits for content before the final frame.
5. **Stripe / billing / SMTP** not configured in this local demo environment — billing portal and real email delivery are out of scope for the recording.
6. Pre-existing Bun-only CLI standalone test fails in this environment.
7. Free-plan seat count briefly exceeds limit while a demo lead is seeded for approval; the recorder deletes lead memberships before the final home frame.

---

## Demo validation checklist

- [x] Homepage
- [x] Signup (fresh account)
- [x] Verification
- [x] Onboarding
- [x] Dashboard
- [x] Create agent
- [x] View agent
- [x] Configure / view permissions
- [x] Browser CLI
- [x] Allowed action
- [x] Denied action
- [x] Approval-required action
- [x] Approve request (lead)
- [x] Activity log
- [x] Audit log
- [x] No unexpected HTTP 500 on the exercised paths
