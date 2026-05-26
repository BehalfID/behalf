# BehalfID Demo

This demo assumes the app is running locally, connected to MongoDB, and `jq` is installed.

```bash
export BASE_URL=http://localhost:3000
```

## Scripted Smoke Test

```bash
BASE_URL=http://localhost:3000 scripts/smoke-test.sh
```

If public agent creation is disabled, pass the setup token:

```bash
BEHALFID_SETUP_TOKEN=replace-this-setup-token BASE_URL=http://localhost:3000 scripts/smoke-test.sh
```

The script checks `/api/health`, checks `/api/health/db` when a setup token is provided, creates an agent, creates a permission, verifies allowed and denied decisions, revokes the permission, rotates the key, confirms the old key fails, confirms the new key works, and reads logs. It redacts API keys before printing responses.

## Console Demo

1. Set `BEHALFID_ADMIN_PASSWORD` in `.env`.
2. Run `npm run dev`.
3. Open `http://localhost:3000/console`.
4. Login with the admin password.
5. Create an agent and store the one-time API key.
6. Open the agent detail page.
7. Create a permission such as `access_data` on `gmail.com`, or a purchase permission with max amount `800`, allowed vendor `coachella.com`, and tomorrow's expiration.
8. Rotate the API key and store the new one.
9. Disable the agent, run a verify request, then enable it again.
10. Review `/console/logs`.

## Developer Portal Demo

1. Open `http://localhost:3000/signup`.
2. Create a developer account with an email and a password of at least 10 characters.
3. Open `/dashboard/onboarding`.
4. Choose an existing agent such as Ollie for manual test mode, or choose a custom agent for developer integration mode.
5. Create the first permission using a template such as data access, scheduling, messaging, or purchase.
6. Test an action in the onboarding flow.
7. For manual mode, open the passport link and copy the generated instructions into the external agent.
8. For developer integration mode, use the SDK or curl demo with the one-time API key.
9. Review `/dashboard/logs` and configure webhooks in `/dashboard/webhooks`.

The dashboard is separate from `/console`; dashboard users only see resources attached to their own developer account. Manual mode helps you test the permission model. Developer integration is required for automatic enforcement.

## Reference Enforcement Demo

`examples/enforcement-demo` demonstrates the core enforcement loop using a real agent, real permissions, the SDK, `/api/verify`, `/api/actions/execute`, and `/api/logs/[agentId]`.

It proves:

- allowed `browse_web` on `web` reaches the Action Gateway executor
- denied `purchase` over `maxAmount` does not run the purchase executor
- denied blocked `send_email` does not run the email executor
- approval-required `renew_subscription` does not run automatically
- missing `deploy_production` permission fails closed
- observed `requestId` values appear in the agent audit logs

### Setup

1. Start the app locally with MongoDB configured, or use the hosted API.
2. Create a fresh demo agent in `/dashboard/onboarding`, `/dashboard/agents`, or `/console/agents`.
3. Store the one-time API key and agent ID.

### Run

```bash
cd examples/enforcement-demo
npm install
cp .env.example .env
```

Fill in `BEHALFID_API_KEY`, `BEHALFID_AGENT_ID`, and `BEHALFID_BASE_URL`, then create the demo permissions:

```bash
npm run setup
npm run demo
```

Expected output:

```txt
BehalfID Action Gateway enforcement demo
Agent:    agent_xxx
Instance: http://localhost:3000

1. Allowed web research through the Action Gateway
   request: browse_web on web
   decision: allowed
   Action Gateway public-web-read executor: executor ran: Example Domain

2. Denied over maxAmount
   request: purchase on example-store.com
   decision: denied (high) - Amount exceeds maxAmount constraint.
   purchase executor: not run

3. Denied blocked action
   request: send_email on gmail.com
   decision: denied (high) - Action is blocked by this permission.
   email executor: not run

4. Approval required
   request: renew_subscription on example-store.com
   decision: denied (medium) - Permission requires approval before execution.
   subscription renewal executor: not run

5. Denied missing permission
   request: deploy_production on github.com
   decision: denied (high) - No active permission exists for this action.
   deployment executor: not run

Audit check
   requestIds observed: req_xxx, req_yyy
   matching logs found: 6/6

Demo complete.
Denied actions failed closed; their executors did not run.
```

The `enforceAction` helper throws on any denial. Any code after the throw in that block does not run. This is fail closed: on denial, the safe default is to not proceed.

## Local MCP Coding-Agent Demo

Use [docs/MCP_DEMO.md](MCP_DEMO.md) to wire a local project for Claude Code, Codex, or another MCP-compatible agent.

```bash
behalf config set base-url http://localhost:3000
behalf config set agent-id agent_xxx
behalf config set api-key bhf_sk_xxx
behalf mcp init
behalf doctor
behalf claude   # or: behalf codex
```

This path writes `.behalf/context.md`, merges `.mcp.json`, exposes `get_permissions` and `verify_action` through MCP, and instructs the agent to fail closed on denied or unavailable verification.

## Sandbox

`/sandbox` demonstrates the same enforcement pattern in the browser without real agents or API keys. The simulated scenarios show an allowed web browse, a denied purchase over the limit, a denied blocked action, a denied missing permission, an approval-required action, and a denied missing constrained resource. Denied and approval-required actions fail closed — the agent stops before reaching the code that would execute them.

## SDK Demo

Install the published SDK package and run the Node demo:

```bash
npm --prefix examples/node-demo install
BEHALFID_BASE_URL=http://localhost:3000 BEHALFID_SETUP_TOKEN=replace-this-setup-token npm --prefix examples/node-demo start
```

If local public agent creation is enabled, the setup token is not needed:

```bash
BEHALFID_PUBLIC_AGENT_CREATION=true npm run dev
BEHALFID_BASE_URL=http://localhost:3000 npm --prefix examples/node-demo start
```

Expected output:

```txt
✓ Allowed: purchase approved
✗ Denied: Amount exceeds maxAmount constraint.
```

The demo does not print API keys.

The scripted SDK demo intentionally uses the purchase template because it exercises both allow and deny amount paths. BehalfID permissions are broader than transactions; the dashboard onboarding also supports data access, messaging/content creation, scheduling, and custom permission templates.

## Webhook Receiver Demo

Install the published SDK package and run the receiver:

```bash
npm --prefix examples/webhook-receiver install
BEHALFID_WEBHOOK_SECRET=whsec_xxx npm --prefix examples/webhook-receiver start
```

Create a webhook in `/console/webhooks` using the displayed one-time secret and URL:

```txt
http://localhost:4000
```

Trigger a verification event, then process queued webhook events:

```bash
curl -s http://localhost:3000/api/webhooks/process \
  -H "Authorization: Bearer $BEHALFID_SETUP_TOKEN" | jq
```

Expected receiver output:

```txt
Received verification.allowed (evt_xxx)
```

The receiver verifies the raw request body with `@behalfid/sdk`, does not log secrets, and should deduplicate events by `eventId` because delivery is at least once.

To test dead-letter and replay behavior:

1. Stop the receiver.
2. Trigger a verification event.
3. Process webhook events until the event reaches `failed` with `deadLetter=true`.
4. Restart the receiver.
5. Open `/console/webhook-events`, select the failed event, and click replay.
6. Process webhook events again and confirm the receiver prints the event.

## Curl Demo

### 1. Create Agent

```bash
CREATE_RESPONSE=$(
  curl -s -X POST "$BASE_URL/api/agents" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $BEHALFID_SETUP_TOKEN" \
    -d '{"name":"Jasper Shopping Agent"}'
)

echo "$CREATE_RESPONSE" | jq 'del(.apiKey)'
export AGENT_ID=$(echo "$CREATE_RESPONSE" | jq -r '.agentId')
export API_KEY=$(echo "$CREATE_RESPONSE" | jq -r '.apiKey')
```

### 2. Create Permission

```bash
PERMISSION_RESPONSE=$(
  curl -s -X POST "$BASE_URL/api/permissions" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $API_KEY" \
    -d "{
      \"agentId\": \"$AGENT_ID\",
      \"action\": \"purchase\",
      \"description\": \"Festival purchase approval\",
      \"constraints\": {
        \"maxAmount\": 800,
        \"allowedVendors\": [\"coachella.com\"],
        \"expiresAt\": \"2099-05-01T23:59:59Z\"
      }
    }"
)

echo "$PERMISSION_RESPONSE" | jq
export PERMISSION_ID=$(echo "$PERMISSION_RESPONSE" | jq -r '.permissionId')
```

### 3. Verify Allowed Purchase

```bash
curl -s -X POST "$BASE_URL/api/verify" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d "{
    \"agentId\": \"$AGENT_ID\",
    \"action\": \"purchase\",
    \"amount\": 742,
    \"vendor\": \"coachella.com\"
  }" | jq
```

### 4. Verify Denied Amount

```bash
curl -s -X POST "$BASE_URL/api/verify" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d "{
    \"agentId\": \"$AGENT_ID\",
    \"action\": \"purchase\",
    \"amount\": 1200,
    \"vendor\": \"coachella.com\"
  }" | jq
```

### 5. Verify Denied Vendor

```bash
curl -s -X POST "$BASE_URL/api/verify" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d "{
    \"agentId\": \"$AGENT_ID\",
    \"action\": \"purchase\",
    \"amount\": 742,
    \"vendor\": \"notcoachella.com\"
  }" | jq
```

### 6. Revoke Permission

```bash
curl -s -X POST "$BASE_URL/api/permissions/$PERMISSION_ID/revoke" \
  -H "Authorization: Bearer $API_KEY" | jq
```

### 7. Verify Denied After Revocation

```bash
curl -s -X POST "$BASE_URL/api/verify" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d "{
    \"agentId\": \"$AGENT_ID\",
    \"action\": \"purchase\",
    \"amount\": 742,
    \"vendor\": \"coachella.com\"
  }" | jq
```

### 8. Rotate API Key

```bash
ROTATE_RESPONSE=$(
  curl -s -X POST "$BASE_URL/api/agents/$AGENT_ID/rotate-key" \
    -H "Authorization: Bearer $API_KEY"
)

echo "$ROTATE_RESPONSE" | jq 'del(.apiKey)'
export NEW_API_KEY=$(echo "$ROTATE_RESPONSE" | jq -r '.apiKey')
```

### 9. Confirm Old API Key Fails

```bash
curl -s "$BASE_URL/api/logs/$AGENT_ID" \
  -H "Authorization: Bearer $API_KEY" | jq
```

### 10. Confirm New API Key Works

```bash
curl -s "$BASE_URL/api/logs/$AGENT_ID" \
  -H "Authorization: Bearer $NEW_API_KEY" | jq
```
