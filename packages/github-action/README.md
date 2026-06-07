# BehalfID Verify Action

Gates dangerous CI/CD steps (deploys, migrations, billing changes) with a BehalfID permission check. **Fails closed** — if the API is unreachable or returns any error, the step fails.

## Quick start

```yaml
- name: Verify production deploy with BehalfID
  uses: behalfid/verify-action@v1
  with:
    api-key: ${{ secrets.BEHALFID_API_KEY }}
    agent-id: ${{ secrets.BEHALFID_AGENT_ID }}
    action: deploy_production
    resource: vercel
    risk: high
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `api-key` | yes | — | BehalfID agent API key (`bhf_sk_...`). Always pass via `${{ secrets.* }}`. |
| `agent-id` | yes | — | BehalfID agent ID that owns the permission. |
| `action` | yes | — | Action name, e.g. `deploy_production`, `run_migration`, `charge_customer`. |
| `resource` | no | — | Resource target, e.g. `vercel`, `aws`, `stripe`, `database`. |
| `risk` | no | `medium` | Risk level hint (`low`, `medium`, `high`). Included in metadata for audit context. |
| `metadata` | no | `{}` | Extra context as a JSON string. CI run ID, branch, PR number, etc. are appended automatically. |
| `base-url` | no | `https://behalfid.com` | Override the BehalfID API URL. For self-hosted instances only. |

## Outputs

| Output | Description |
|--------|-------------|
| `request-id` | Unique BehalfID request ID — include in deployment logs for traceability. |
| `reason` | Human-readable explanation of the decision. |
| `decision` | `"allowed"` or `"denied"`. |

## Behavior

| API response | Step result |
|-------------|-------------|
| `allowed: true` | ✅ Step passes |
| `allowed: false` | ❌ Step fails with reason |
| Approval required (reason text match) | ❌ Step fails with "Approval required" prefix |
| Network error | ❌ Step fails closed |
| HTTP 4xx / 5xx | ❌ Step fails closed |

Secrets are masked immediately on startup via `core.setSecret()`. Token patterns (`bhf_sk_*`, `Bearer *`) are also stripped from error messages as a belt-and-suspenders measure.

## Example workflows

### Gate a Vercel production deploy

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Verify production deploy with BehalfID
        id: behalf
        uses: behalfid/verify-action@v1
        with:
          api-key: ${{ secrets.BEHALFID_API_KEY }}
          agent-id: ${{ secrets.BEHALFID_AGENT_ID }}
          action: deploy_production
          resource: vercel
          risk: high
          metadata: '{"branch":"main","triggered_by":"push"}'

      - name: Deploy to Vercel
        run: vercel deploy --prod
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
```

### Gate a database migration

```yaml
      - name: Verify migration with BehalfID
        uses: behalfid/verify-action@v1
        with:
          api-key: ${{ secrets.BEHALFID_API_KEY }}
          agent-id: ${{ secrets.BEHALFID_AGENT_ID }}
          action: run_migration
          resource: database
          risk: high

      - name: Run migrations
        run: npm run db:migrate
```

### Use outputs for audit logging

```yaml
      - name: Verify
        id: behalf
        uses: behalfid/verify-action@v1
        with:
          api-key: ${{ secrets.BEHALFID_API_KEY }}
          agent-id: ${{ secrets.BEHALFID_AGENT_ID }}
          action: deploy_production
          resource: aws

      - name: Log approval
        run: |
          echo "Approved: ${{ steps.behalf.outputs.decision }}"
          echo "Reason: ${{ steps.behalf.outputs.reason }}"
          echo "Request ID: ${{ steps.behalf.outputs.request-id }}"
```

## Setup

1. Create an agent at [behalfid.com](https://behalfid.com) and copy the agent ID and API key.
2. Add `BEHALFID_API_KEY` and `BEHALFID_AGENT_ID` to your repository secrets under **Settings → Secrets and variables → Actions**.
3. Configure the permission policy for `deploy_production` (or your action) in the BehalfID dashboard.

## Development

```bash
# Install dependencies
npm install

# Run tests (14 unit tests covering all decision paths)
npm test

# Typecheck
npm run typecheck

# Rebuild dist/ after source changes (required before publishing)
npm run build
```

> **Publishing note**: For `uses: behalfid/verify-action@v1` to work, the contents of this directory (including the built `dist/`) must be published to the `behalfid/verify-action` GitHub repository and tagged `v1`. The `dist/index.js` must be committed — GitHub Actions runs the bundled file directly without `npm install`.
