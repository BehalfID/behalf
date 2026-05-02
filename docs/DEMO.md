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
7. Create a purchase permission with max amount `800`, allowed vendor `coachella.com`, and tomorrow's expiration.
8. Rotate the API key and store the new one.
9. Disable the agent, run a verify request, then enable it again.
10. Review `/console/logs`.

## SDK Demo

Build the local SDK package and run the Node demo:

```bash
npm --prefix packages/sdk install
npm --prefix packages/sdk run build
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
