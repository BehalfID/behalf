# BehalfID Demo

This smoke flow assumes the app is running locally and `jq` is installed.

```bash
export BASE_URL=http://localhost:3000
```

You can run the complete scripted smoke test instead:

```bash
BASE_URL=http://localhost:3000 scripts/smoke-test.sh
```

The app must be running and connected to MongoDB through `MONGODB_URI`. The script requires `jq`.

## 1. Create Agent

```bash
CREATE_RESPONSE=$(
  curl -s -X POST "$BASE_URL/api/agents" \
    -H "Content-Type: application/json" \
    -d '{"name":"Jasper Shopping Agent"}'
)

echo "$CREATE_RESPONSE" | jq 'del(.apiKey)'
export AGENT_ID=$(echo "$CREATE_RESPONSE" | jq -r '.agentId')
export API_KEY=$(echo "$CREATE_RESPONSE" | jq -r '.apiKey')
```

## 2. Create Permission

```bash
PERMISSION_RESPONSE=$(
  curl -s -X POST "$BASE_URL/api/permissions" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $API_KEY" \
    -d "{
      \"agentId\": \"$AGENT_ID\",
      \"action\": \"purchase\",
      \"constraints\": {
        \"maxAmount\": 800,
        \"allowedVendors\": [\"coachella.com\"],
        \"expiresAt\": \"2027-05-01T23:59:59Z\"
      }
    }"
)

echo "$PERMISSION_RESPONSE" | jq
export PERMISSION_ID=$(echo "$PERMISSION_RESPONSE" | jq -r '.permissionId')
```

## 3. Verify Allowed Purchase

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

Expected:

```json
{
  "allowed": true,
  "reason": "Action allowed by active permission.",
  "risk": "low"
}
```

## 4. Verify Denied Purchase Because Amount Is Too High

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

## 5. Verify Denied Purchase Because Vendor Is Not Allowed

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

## 6. Revoke Permission

```bash
curl -s -X POST "$BASE_URL/api/permissions/$PERMISSION_ID/revoke" \
  -H "Authorization: Bearer $API_KEY" | jq
```

## 7. Verify Denied Purchase After Revocation

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

## 8. View Logs

```bash
curl -s "$BASE_URL/api/logs/$AGENT_ID" \
  -H "Authorization: Bearer $API_KEY" | jq
```

Log entries include `permissionId` when a permission was evaluated, or `null` when no permission matched.

## 9. Rotate API Key

```bash
ROTATE_RESPONSE=$(
  curl -s -X POST "$BASE_URL/api/agents/$AGENT_ID/rotate-key" \
    -H "Authorization: Bearer $API_KEY"
)

echo "$ROTATE_RESPONSE" | jq 'del(.apiKey)'
export NEW_API_KEY=$(echo "$ROTATE_RESPONSE" | jq -r '.apiKey')
```

## 10. Confirm Old API Key Fails

```bash
curl -s "$BASE_URL/api/logs/$AGENT_ID" \
  -H "Authorization: Bearer $API_KEY" | jq
```

## 11. Confirm New API Key Works

```bash
curl -s "$BASE_URL/api/logs/$AGENT_ID" \
  -H "Authorization: Bearer $NEW_API_KEY" | jq
```
