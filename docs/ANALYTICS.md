# Admin analytics

Canonical definitions for every number on the internal console analytics
dashboard (`/console/analytics`) and the console home health summary.

The authoritative machine-readable copy of these definitions ships in
[`lib/adminAnalytics/definitions.ts`](../lib/adminAnalytics/definitions.ts) and is
returned inside every `GET /api/console/analytics` response under `definitions`.
If a number's meaning changes, change it there — this document mirrors it.

## Root cause of prior inaccuracies

Tracing UI → API → DB showed the console was mixing **three different
populations and taxonomies** for verification stats:

1. **Workspace scoping mismatch** — `GET /api/console/summary` filtered
   verification counts through `getConsoleAccountId()` (one legacy workspace)
   while user and workspace totals were platform-wide. Cards on the same screen
   described different universes.
2. **Local timezone drift** — “Today” used `Date.setHours(0,0,0,0)` in the
   server’s local timezone instead of UTC, so day boundaries shifted with
   deployment region and disagreed with graph buckets.
3. **Approval pauses counted as denials** — aggregations used
   `denied = !allowed`, which treats every `allowed: false` row as a denial.
   Approval-gated attempts (`approvalRequired: true` or matching reason
   phrases) were folded into deny counts and deny rates.
4. **Shadow mode not separated** — shadow simulations were included in
   enforced totals and rates even though they never gated an agent.
5. **Client-side recomputation** — the 14-day activity graph grouped logs in
   the route without zero-filling or the canonical outcome split, so sparse
   days disappeared and approval/shadow semantics did not match summary cards.

Workstream C centralizes aggregation in `lib/adminAnalytics/index.ts` and makes
both `/api/console/analytics` and `/api/console/summary` reuse the same outcome
taxonomy, UTC windows, and database-side rollups.

## Endpoints

| Endpoint | Auth | Purpose |
| --- | --- | --- |
| `GET /api/console/analytics` | Console session (`requireConsoleApi`) | Every card, graph and table on the analytics page, from one window and one database read |
| `GET /api/console/summary` | Console session (`requireConsoleApi`) | Console home health strip and 14-day activity graph |

### Query parameters

| Parameter | Values | Notes |
| --- | --- | --- |
| `interval` | `24h`, `7d`, `30d`, `90d`, `all`, `custom` | Defaults to `7d` |
| `from`, `to` | ISO-8601 timestamp or `YYYY-MM-DD` | Required when `interval=custom` |
| `accountId` | workspace id | Optional drill-down; omit for the platform-wide view |

Validation failures return `400` with a machine-readable `code`:
`invalid_interval`, `invalid_date`, `inverted_range`, `range_too_large`,
`missing_custom_range`, `invalid_account_id`.

### Range caps

Custom ranges are limited to **400 days** (`range_too_large`). Series are capped
at **400 buckets**; a wider window still returns exact summary totals but the
series is clamped to the most recent 400 buckets and `partialReasons` includes
`series_truncated_to_bucket_cap`.

## Time handling

- Every window is **half-open in UTC**: `start <= createdAt < end`.
- Buckets are aligned to UTC hour or UTC day boundaries. The server's local
  timezone is never consulted, so results do not change with deployment region.
- `24h` uses **hourly** buckets. `7d`, `30d`, `90d` and `all` use **daily**
  buckets. `custom` uses hourly buckets up to a 48-hour span, daily beyond that.
- Preset windows end at the boundary *after* the current bucket, so the newest
  bucket is included while still filling. That is reported as
  `partialReasons: ["newest_bucket_incomplete"]`.
- A date-only `to=2026-05-18` means "through the end of the 18th", i.e. the
  exclusive bound is midnight at the start of the 19th.
- Buckets with no rows are returned as **explicit zeros**, never omitted.
- The UI labels every timestamp and axis as UTC.

## Verification outcome taxonomy

Derived from `VerificationLog` records. One record is one `verify()` call.

| Outcome | Condition |
| --- | --- |
| `allowed` | `allowed === true` |
| `denied` | `allowed === false` and **not** an approval gate — a hard policy denial |
| `approval_required` | `allowed === false` and `approvalRequired === true`, or `reason` matches `requires approval` / `approval required` / `approval before execution` |
| `indeterminate` | `allowed` is absent or not a boolean, so no outcome can be derived |

These four are **mutually exclusive and exhaustive**:

```
allowed + denied + approval_required + indeterminate === enforced
```

An approval pause is therefore never also counted as a denial. `indeterminate`
is a data-integrity counter, not agent behaviour; it should normally be zero.

### Shadow mode

`shadow: true` records are simulations with no enforcement side effects. They are:

- **excluded** from `enforced` and from every outcome count and rate;
- **included** in `attempts`, `uniqueAgents` and `uniqueWorkspaces`, because a
  shadow-mode agent is still active traffic;
- reported on their own as `summary.verifications.shadow` and as a distinct
  series on the activity graph.

`enforced + shadow === attempts`.

### Approvals and retries

An agent that polls `verify()` while an approval is pending records **one
`approvalRequired` attempt per call** but produces only **one `ApprovalRequest`**
(enforced by a partial unique index on the pending request tuple). After a human
approves, the agent's retry is a **separate attempt** and appears under
`allowed`.

So `summary.verifications.approvalRequired` is expected to exceed
`summary.approvals.createdInPeriod`. Approval throughput must be read from the
approval fields, which are sourced from `ApprovalRequest` and cannot be inflated
by retries:

| Field | Definition |
| --- | --- |
| `createdInPeriod` | `ApprovalRequest.createdAt` in window |
| `approvedInPeriod` | status `approved` or `used`, `resolvedAt` in window |
| `deniedInPeriod` | status `denied`, `resolvedAt` in window |
| `usedInPeriod` | `usedAt` in window (a grant consumed by a later verify) |
| `pendingNow` | status `pending`, **not** window-scoped — a live backlog |

## Rates

Every rate ships its own numerator and denominator:

```json
{ "numerator": 41, "denominator": 50, "denominatorField": "summary.verifications.enforced", "value": 0.82 }
```

- `value` is a fraction in `[0, 1]`, rounded to six decimal places.
- **Denominator is `enforced`** for allow, deny, approval-required,
  indeterminate and high-risk rates.
- **Denominator is `attempts`** for `shadowShare`.
- When the denominator is zero, `value` is `null` and the UI renders `—`. An
  undefined rate is never reported as `0`.

## Counts

### Users and workspaces

| Metric | Definition |
| --- | --- |
| `users.total` | `DeveloperUser` records that exist now |
| `users.new` | `DeveloperUser.createdAt` in window |
| `workspaces.total` | `Account` records that exist now (one Account is one workspace) |
| `workspaces.new` | `Account.createdAt` in window |

### Agents — two meanings of "active"

| Metric | Definition |
| --- | --- |
| `agents.total` | `Agent` records that exist now, any status |
| `agents.new` | `Agent.createdAt` in window |
| `agents.activeConfigured` | `Agent.status === "active"` — a **configuration** state. An enabled agent that never calls `verify()` still counts. |
| `agents.activeInPeriod` | Distinct `agentId` values with **at least one verification attempt in the window**, shadow included. This is the **usage-based** definition and is what the "Active agents" card and graph show. |

On the *Active agents over time* graph each bucket counts distinct agents active
**within that bucket**. Buckets therefore do **not** sum to
`agents.activeInPeriod`: an agent active on three days is counted once per day.

## Breakdowns

- **Top workspaces / top agents** — ranked server-side by attempts in the
  window, capped at 10 rows. Outcome columns are enforced-only, so
  `allowed + denied + approvalRequired` can be less than `attempts` when the
  workspace or agent used shadow mode. Attempts with no `accountId` are grouped
  under a null id and shown as "Unassigned".
- **Sign-in method adoption** — counted from persisted `DeveloperUser` identity
  fields, not from sign-in events. Rows come from `authProviders`; records
  predating that field are classified from `passwordHash` / `googleSub`. A user
  with several methods is counted under each, so the rows can exceed
  `users.total`. Records with no derivable method appear as `unknown_legacy`
  rather than being dropped. The provider list is driven by `AUTH_PROVIDERS` in
  `models/DeveloperUser.ts`, so a newly declared provider appears automatically
  — as a real count once users exist, and as an explicit zero row until then.
  Workspace-level Google SSO enablement is reported separately from user
  sign-in methods.

## Freshness and partial data

| Field | Meaning |
| --- | --- |
| `asOf` | When the payload was computed (server clock, UTC) |
| `freshness.latestVerificationAt` | `createdAt` of the newest verification in scope, ignoring the window |
| `freshness.lagSeconds` | Seconds between the two above; `null` when there is no data |
| `partial` | True when the payload is knowingly incomplete |
| `partialReasons` | `newest_bucket_incomplete`, `series_truncated_to_bucket_cap`, or `degraded:<source>` when one aggregation failed |

Responses are sent with `Cache-Control: private, no-store`, so console figures
are never served from a CDN or browser cache.

## Console home summary

`GET /api/console/summary` reports the same taxonomy over **the current UTC
calendar day** and reuses the same aggregation helpers, so the home strip cannot
disagree with the analytics page. Its 14-day activity graph uses UTC daily
buckets with the same outcome split.

## Where the numbers come from

| Concern | File |
| --- | --- |
| Metric definitions | `lib/adminAnalytics/definitions.ts` |
| UTC boundaries, bucketing, zero-fill, range caps | `lib/adminAnalytics/range.ts` |
| Aggregation and payload assembly | `lib/adminAnalytics/index.ts` |
| Shared types | `lib/adminAnalytics/types.ts` |
| Endpoint | `app/api/console/analytics/route.ts` |
| Dashboard UI | `app/console/analytics/client.tsx` |
| Chart primitives | `components/console/AnalyticsCharts.tsx` |
| Tests | `test/admin-analytics-range.test.ts`, `test/admin-analytics-service.test.ts`, `test/console-analytics-route.test.ts` |

All aggregation runs in the database. No unbounded history is loaded into
application memory: series length is capped, rankings are limited to 10 rows,
and no code path fetches raw log documents to compute totals.
