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

1. Set `BEHALFID_ADMIN_PASSWORD` in `.env.local`.
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

`examples/enforcement-demo` demonstrates the core enforcement pattern using a pre-configured agent and permission. Denied actions fail closed.

### Setup

1. Create an agent in `/dashboard/onboarding` and store the one-time API key.
2. Create a `browse_web` permission on `web` using the Browse web scope template — allowed actions: `search web, read public pages`; blocked actions: `submit forms, make purchases`.
3. Do **not** create `purchase` or `send_message` permissions — the demo tests that those are denied.

### Run

```bash
npm --prefix examples/enforcement-demo install
BEHALFID_API_KEY=bhf_sk_... BEHALFID_AGENT_ID=agent_... npm --prefix examples/enforcement-demo start
```

For a local instance:

```bash
BEHALFID_API_KEY=bhf_sk_... BEHALFID_AGENT_ID=agent_... BEHALFID_BASE_URL=http://localhost:3000 npm --prefix examples/enforcement-demo start
```

Expected output:

```txt
BehalfID enforcement demo
Agent:    agent_xxx
Instance: https://behalfid.com

1. browse_web on web
   ✓ Allowed — proceeding: searching for flights to Tokyo...

2. purchase on coachella.com ($742)
   ✗ Blocked — Action blocked by BehalfID: No active permission exists for this action.
   The agent did not complete the purchase.

3. send_message on slack.com
   ✗ Blocked — Action blocked by BehalfID: No active permission exists for this action.
   The agent did not send the message.

Demo complete.
Denied actions failed closed — the agent never reached those lines.
```

The `enforceAction` helper throws on any denial. Any code after the throw in that block does not run — the agent stops before acting. This is fail closed: on denial, the safe default is to not proceed.

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
