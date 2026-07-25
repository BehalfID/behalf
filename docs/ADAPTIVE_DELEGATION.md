# Adaptive Delegation

Adaptive Delegation reduces approval fatigue by recommending reusable permissions, trust profiles, context-scoped policies, and organization templates from historical approval patterns. It is **advisory only**.

## Non-negotiables

- `verifyAction()` (`lib/verify.ts`) remains the sole authorization decision point.
- Existing Permissions and Approvals remain the source of truth.
- Recommendations never auto-grant permissions, enable auto-approval, expand authority, or bypass `verify()`.
- Every authority increase requires an explicit human decision through existing mutation paths:
  - Stage 3: `createPermissionForAgent()`
  - Stage 4: `createPermissionProfile()` + `applyPermissionProfile()` (one agent)
  - Stage 5: `createPermissionForAgent()` with context constraints
  - Stage 6: `createPermissionProfile()` + N× `applyPermissionProfile()` for **selected** agents

## Stage map

| Stage | Status | Notes |
|-------|--------|-------|
| 0 Zero Trust | Existing | Permissions with `requiresApproval` gate through ApprovalRequest |
| 1 Session Delegation | Existing (partial) | 30-minute approval grants; `constraints.expiresAt`; CLI pause leases |
| 2 Scoped Delegation | Existing (partial) | `allowedActions` / `blockedActions`, path/command constraints |
| **3 Deterministic Recommendations** | **Implemented** | Per-action reusable permission recommendations |
| **4 Trust Profiles** | **Implemented** | Role bundles per agent |
| **5 Context-Aware Authorization** | **Implemented** | Branch / environment / repository constraints |
| **6 Organization Delegation** | **Implemented** | Cross-agent org templates under account authority |

## Architecture

```
ApprovalRequest + VerificationLog history (+ metadata context)
              ↓
   AdaptiveDelegationEngine (advisory)
        ├─ reusable_permission
        ├─ trust_profile
        ├─ context_scoped_permission
        └─ organization_delegation
              ↓
   Human decision (Create/Apply / Keep / Postpone / Never)
              ↓
   Existing permission / profile mutation paths
              ↓
   verifyAction() still decides every request
```

## Stage 6 — Organization delegation

Templates in `lib/adaptiveDelegation/orgTemplates.ts`:

| Template | Intent |
|----------|--------|
| Engineering | Repo/PR collaboration; shell/prod deploy stay gated |
| Finance | Finance reads/reports; purchases & billing APIs gated |
| Security | Audit reads; secrets stay gated (Owner to accept) |
| CI/CD | Staging deploy + dependency updates; prod gated |
| Contractors | Read-heavy; writes/email/shell gated |

Matching rules (fail closed):

- At least `minOrgAgents` (default 2) distinct agents
- Coverage ≥ `minProfileCoverage` of template actions
- Aggregate denial rate ≤ 20%
- Confidence ≥ `minConfidence`

Acceptance:

1. Requires workspace authority ≥ template minimum (Lead 80, Security Owner 100)
2. Creates one account-scoped `PermissionProfile` (`Org: {name}`)
3. Applies only to **explicitly selected** `agentIds` (subset of recommendation)
4. Never silently fleet-applies
5. ManagedProfilePolicy + membership roles remain governing authority

## Confidence / thresholds

Default thresholds:

- `minApprovals`: 5
- `minConfidence`: 70
- `lookbackDays`: 90
- `postponeDays`: 7
- `minProfileCoverage`: 0.6
- `minProfileMatchedActions`: 2
- `minContextApprovals`: 5
- `minOrgAgents`: 2

Scores never feed into `verifyAction()`.

## API

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/api/dashboard/adaptive-delegation` | List / refresh |
| GET | `/api/dashboard/adaptive-delegation/:id` | View |
| POST | `.../:id/accept` | Accept; org templates may pass `{ agentIds: string[] }` |
| POST | `.../:id/dismiss` | `keep_manual` or `never_suggest` |
| POST | `.../:id/postpone` | Remind later |

## Dashboard

Control plane → **Adaptive Delegation**

- Permission, trust profile, context-scoped, and organization recommendations
- Org cards include agent multi-select before apply
- Applied / dismissed / postponed + estimated prompt reduction

## Key files

- `lib/adaptiveDelegation/` — engine, confidence, context, trust/org templates, matching, history, service
- `lib/verify.ts` — Stage 5 context hard constraints
- `models/Permission.ts` / `PermissionProfile.ts`
- `models/AdaptiveDelegationRecommendation.ts`
- `components/dashboard/AdaptiveDelegationConsole.tsx`
