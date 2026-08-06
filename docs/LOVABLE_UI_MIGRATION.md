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

Tracked in [#181](https://github.com/BehalfID/behalf/issues/181).
