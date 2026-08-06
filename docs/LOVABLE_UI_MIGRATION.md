# Lovable UI migration — route and component mapping

Production is authoritative for all behaviour. The Lovable repository
(`BehalfID/agent-gatekeeper-suite`) is a visual reference only.

**Lovable source used by this document:** `130b83bbce0d43fbe2cf555403533f7880c627f0`
("Add project README", 2026-08-01). At that commit the mirror had one branch,
no tags, and a clean tree identical to `origin/main` — it was already current.

## What the Lovable reference actually contains

This matters more than it sounds, because it bounds what can honestly be called
a port. From the reference build's own documents:

- `PAGE_INVENTORY.md`, "Proposed, not implemented": *"The authenticated app
  shell (`dashboard-shell.tsx`, `console-shell.tsx`) exists, but no dashboard
  routes are part of this reference build."*
- `INTEGRATION_NOTES.md`: *"Dashboard/console shells — UI only, not routed."*

Enumerated directly: `src/routes/` holds the marketing pages, `login`, `signup`
and MCP/OAuth infrastructure. There is **no dashboard route and no onboarding
route of any kind**. `src/components/layouts/dashboard-shell.tsx` exists but is
imported by nothing and is bound to `@/lib/mock/data`.

| Surface | Lovable source | Portable? |
| --- | --- | --- |
| Dashboard shell (sidebar, switcher, user menu, header) | `src/components/layouts/dashboard-shell.tsx` | **Yes** — real design, ported below |
| Dashboard overview, agents, agent detail, permissions, approvals, activity, managed profiles, protected repos, webhooks, billing, settings | *none* | No — never built |
| Onboarding, first-agent setup | *none* | No — README prose brief only |

## Migrated: dashboard chrome

| | |
| --- | --- |
| **Lovable source** | `src/components/layouts/dashboard-shell.tsx` @ `130b83b` |
| **Production routes** | `/dashboard/*` and `/workspace/[workspaceSlug]/dashboard/*` |
| **Production files** | `components/layout/DashboardShell.tsx`, `components/layout/DashboardMenu.tsx`, `lib/dashboardShellServer.ts`, `lib/dashboardShellPresentation.ts`, `app/dashboard/layout.tsx`, `app/workspace/[workspaceSlug]/dashboard/layout.tsx`, `app/workspace/[workspaceSlug]/dashboard/providers.tsx`, `app/globals.css` |
| **Risk** | Medium — one shared shell behind every authenticated page |

### Element-by-element

| Lovable element | Lovable data | Production data | Notes |
| --- | --- | --- | --- |
| `WorkspaceSwitcher` dropdown | `workspaces` mock array | `GET /api/dashboard/accounts` → `listUserAccounts` | Real accounts, roles and switch via `/api/dashboard/accounts/switch`. Renders as static identity when the user belongs to one workspace — a menu that can only contain the current workspace is a control that does nothing. |
| Switcher subtitle `plan · role` | mock `ws.plan` | `effectivePlan(account)` server-side + membership role | Effective plan, so a complimentary grant does not read as "free". Shown only for the active workspace — plan is not known for the others without N reads. |
| `UserMenu` (avatar, name, email) | `currentUser` mock | `getCurrentDeveloperContext()` in the server layout | Passed as props, not fetched: identity is known during SSR, so a client fetch would add a request per page and visibly swap the name in after hydration. Falls back to the email when the profile has no name. |
| Sign out | `<Link to="/login">` | `<a href="/logout">` | Must stay a document navigation — the GET route clears the session server-side before redirecting. |
| Secondary nav (Documentation, Status & support) | static links | workspace-scoped `/docs`, public `/status` | |
| Nav badge (pending approvals count) | `approvals.filter(pending).length` on mock data | **omitted** | `/api/dashboard/approvals` returns up to 100 hydrated rows, not a count; there is no cheap production source. Omitted rather than hardcoded — guarded by a test. |
| ⌘K command menu | `CommandDialog` | already exists as `DashboardOmniSearch` | Not duplicated. |
| Radix `DropdownMenu` | `@radix-ui/react-dropdown-menu` | `components/layout/DashboardMenu.tsx` | Radix is not a production dependency. The menu follows the `<details>` disclosure pattern already used by `components/ui/Overlay.tsx` rather than introducing a third interaction model, and adds Escape + outside-pointer dismissal. |
| Lucide icons | `lucide-react` | existing inline `NavIcon` SVGs | Two icons added (`docs`, `support`); no icon dependency introduced. |

### Styling boundary

The chrome elements (`<aside>`, both `<header>`s) carry `.ds`, which resolves
the `--ds-*` token set on that subtree. `<main>` is deliberately excluded, so
page interiors keep the production token set until each is ported on its own.

The shared sidebar rules in `app/globals.css` are also used by `.docs-sidebar`,
`.console-sidebar` and `.app-sidebar`; they are left untouched and the port adds
a new `.dashboard-shell`-scoped block instead. Restyling the shared rules would
leak this change into docs, console and other app shells.

A scan confirmed no production dashboard markup uses any `.ds` utility class
name, so opting the chrome in activates tokens only.

## Not migrated, and why

Onboarding and every dashboard page interior have **no Lovable source**. They
are not included here. Building them from the README prose brief would be new
design work, not a port, and could not be checked against any reference.

Producing those screens in Lovable and pushing them to the mirror is the
prerequisite for migrating them.

---

# Correction: authenticated shell fidelity (PR #181)

PR #180 kept the legacy shell composition and recoloured it. The structure —
brand block with a "Control plane" subtitle, legacy nav taxonomy, breadcrumb top
bar, workspace name as raw text in the top right — was unchanged, so the result
still read as the legacy dashboard. It also shipped without an authenticated
screenshot, which is why the mismatch was not caught.

## What changed

The chrome is rebuilt in a `shell-*` namespace with its own stylesheet
(`components/layout/dashboard-chrome.css`). Reusing the legacy
`dashboard-sidebar` / `app-sidebar` names meant inheriting a composition built
for a different design and fighting it with overrides; a fresh namespace means
no legacy selector applies.

| Reference element | Production route / source |
| --- | --- |
| Brand "Behalf/ID" | static, links to the overview |
| Workspace selector | `/api/dashboard/accounts`, switch via `/accounts/switch` |
| Plan · role descriptor | `effectivePlan(account)` + membership role, server-resolved |
| Overview | dashboard index |
| Agents | `/agents` |
| Approvals | `/approvals` |
| Activity | `/logs` |
| Managed profiles | `/managed-profiles` |
| Team | **no separate route** — production merges members into `/settings`, shown as "Settings & members" |
| Usage & billing | `/billing` |
| Settings | `/settings` |
| Protected repositories | **no page route** — only an API (`/api/dashboard/managed-profiles/protected-repos`); omitted rather than linked to a dead path |
| Documentation | `/docs` |
| Status & support | `/status` (public, host-neutral) |
| Plan usage card | `effectivePlan` + `verificationCount` from the account row already read; `effectiveEntitlements().monthlyVerifications` for the limit |
| Search | existing `DashboardOmniSearch`, left-aligned per the reference |
| Appearance control | existing `DsAppearanceToggle` (already the 3-segment Lovable control) |
| Add agent | `/onboarding`, hidden unless the actor may mutate |
| Notification bell | links to `/inbox`; **no indicator dot** — there is no cheap production source for a pending count, so none is invented |

Production surfaces with no reference equivalent (Needs attention, Adaptive
delegation, Webhooks) are kept under OPERATE rather than deleted — removing them
would remove navigation to working features.

## Boundaries kept

The wrapper still carries the legacy `dashboard-shell` class, because that class
supplies the page-interior palette and `.app-main` layout. Dropping it silently
restyled every dashboard page; the chrome's own grid wins on specificity
instead. `.ds` is on the sidebar and the two headers only — never the wrapper,
because that pulls `<main>` into the design-system scope.

## Verification

`scripts/dev/authenticated-shell-preview.mjs` boots a disposable Postgres,
applies the migration chain, seeds a verified user with a workspace and a live
session, starts the built app against it, and screenshots the real authenticated
shell. It requires `npm i --no-save embedded-postgres` and touches no real
database.
