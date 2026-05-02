#!/usr/bin/env bash
set -euo pipefail

BASE_URL=${BASE_URL:-http://localhost:3000}

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required to run this smoke test." >&2
  exit 1
fi

step() {
  printf "\n==> %s\n" "$1"
}

post_json() {
  local path=$1
  local api_key=$2
  local body=$3

  curl -s -X POST "$BASE_URL$path" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $api_key" \
    -d "$body"
}

expect_json_value() {
  local json=$1
  local jq_filter=$2
  local expected=$3
  local actual

  actual=$(echo "$json" | jq -r "$jq_filter")
  if [[ "$actual" != "$expected" ]]; then
    echo "Expected $jq_filter to be '$expected' but got '$actual'." >&2
    redact_json "$json" >&2
    exit 1
  fi
}

redact_json() {
  local json=$1

  echo "$json" | jq 'if type == "object" then del(.apiKey) else . end'
}

print_json_response() {
  local json=$1
  local label=$2

  if ! echo "$json" | jq -e . >/dev/null 2>&1; then
    echo "Expected JSON response from $label." >&2
    echo "$json" >&2
    exit 1
  fi

  redact_json "$json"
}

require_json_field() {
  local json=$1
  local jq_filter=$2
  local label=$3
  local value

  if ! echo "$json" | jq -e . >/dev/null 2>&1; then
    echo "Expected JSON response while reading $label." >&2
    echo "$json" >&2
    exit 1
  fi

  value=$(echo "$json" | jq -r "$jq_filter")
  if [[ -z "$value" || "$value" == "null" ]]; then
    echo "Missing $label in response." >&2
    redact_json "$json" >&2
    exit 1
  fi

  printf "%s" "$value"
}

step "1. Create agent"
CREATE_RESPONSE=$(
  curl -s -X POST "$BASE_URL/api/agents" \
    -H "Content-Type: application/json" \
    -d '{"name":"Jasper Shopping Agent"}'
)
print_json_response "$CREATE_RESPONSE" "create agent"
AGENT_ID=$(require_json_field "$CREATE_RESPONSE" ".agentId" "agentId")
API_KEY=$(require_json_field "$CREATE_RESPONSE" ".apiKey" "apiKey")

step "2. Create permission"
PERMISSION_RESPONSE=$(
  post_json "/api/permissions" "$API_KEY" "{
    \"agentId\": \"$AGENT_ID\",
    \"action\": \"purchase\",
    \"constraints\": {
      \"maxAmount\": 800,
      \"allowedVendors\": [\"coachella.com\"],
      \"expiresAt\": \"2099-05-01T23:59:59Z\"
    }
  }"
)
print_json_response "$PERMISSION_RESPONSE" "create permission"
PERMISSION_ID=$(require_json_field "$PERMISSION_RESPONSE" ".permissionId" "permissionId")

step "3. Verify allowed purchase"
ALLOWED_RESPONSE=$(
  post_json "/api/verify" "$API_KEY" "{
    \"agentId\": \"$AGENT_ID\",
    \"action\": \"purchase\",
    \"amount\": 742,
    \"vendor\": \"coachella.com\"
  }"
)
print_json_response "$ALLOWED_RESPONSE" "verify allowed purchase"
expect_json_value "$ALLOWED_RESPONSE" ".allowed" "true"
require_json_field "$ALLOWED_RESPONSE" ".requestId" "allowed requestId" >/dev/null

step "4. Verify denied amount"
DENIED_AMOUNT_RESPONSE=$(
  post_json "/api/verify" "$API_KEY" "{
    \"agentId\": \"$AGENT_ID\",
    \"action\": \"purchase\",
    \"amount\": 1200,
    \"vendor\": \"coachella.com\"
  }"
)
print_json_response "$DENIED_AMOUNT_RESPONSE" "verify denied amount"
expect_json_value "$DENIED_AMOUNT_RESPONSE" ".allowed" "false"
require_json_field "$DENIED_AMOUNT_RESPONSE" ".requestId" "denied amount requestId" >/dev/null

step "5. Verify denied vendor"
DENIED_VENDOR_RESPONSE=$(
  post_json "/api/verify" "$API_KEY" "{
    \"agentId\": \"$AGENT_ID\",
    \"action\": \"purchase\",
    \"amount\": 742,
    \"vendor\": \"notcoachella.com\"
  }"
)
print_json_response "$DENIED_VENDOR_RESPONSE" "verify denied vendor"
expect_json_value "$DENIED_VENDOR_RESPONSE" ".allowed" "false"
require_json_field "$DENIED_VENDOR_RESPONSE" ".requestId" "denied vendor requestId" >/dev/null

step "6. Revoke permission"
REVOKE_RESPONSE=$(
  curl -s -X POST "$BASE_URL/api/permissions/$PERMISSION_ID/revoke" \
    -H "Authorization: Bearer $API_KEY"
)
print_json_response "$REVOKE_RESPONSE" "revoke permission"
expect_json_value "$REVOKE_RESPONSE" ".revoked" "true"

step "7. Verify denied after revoke"
DENIED_REVOKE_RESPONSE=$(
  post_json "/api/verify" "$API_KEY" "{
    \"agentId\": \"$AGENT_ID\",
    \"action\": \"purchase\",
    \"amount\": 742,
    \"vendor\": \"coachella.com\"
  }"
)
print_json_response "$DENIED_REVOKE_RESPONSE" "verify denied after revoke"
expect_json_value "$DENIED_REVOKE_RESPONSE" ".allowed" "false"
require_json_field "$DENIED_REVOKE_RESPONSE" ".requestId" "denied revoke requestId" >/dev/null

step "8. Rotate API key"
ROTATE_RESPONSE=$(
  curl -s -X POST "$BASE_URL/api/agents/$AGENT_ID/rotate-key" \
    -H "Authorization: Bearer $API_KEY"
)
print_json_response "$ROTATE_RESPONSE" "rotate API key"
NEW_API_KEY=$(require_json_field "$ROTATE_RESPONSE" ".apiKey" "rotated apiKey")

step "9. Confirm old API key fails"
OLD_KEY_RESPONSE=$(
  curl -s -X GET "$BASE_URL/api/logs/$AGENT_ID" \
    -H "Authorization: Bearer $API_KEY"
)
print_json_response "$OLD_KEY_RESPONSE" "confirm old API key fails"
expect_json_value "$OLD_KEY_RESPONSE" ".error" "API key does not match this agent."

step "10. Confirm new API key works"
NEW_KEY_RESPONSE=$(
  curl -s -X GET "$BASE_URL/api/logs/$AGENT_ID" \
    -H "Authorization: Bearer $NEW_API_KEY"
)
print_json_response "$NEW_KEY_RESPONSE" "confirm new API key works"
expect_json_value "$NEW_KEY_RESPONSE" "type" "array"

step "11. View logs"
LOGS_RESPONSE=$(
  curl -s -X GET "$BASE_URL/api/logs/$AGENT_ID" \
    -H "Authorization: Bearer $NEW_API_KEY"
)
print_json_response "$LOGS_RESPONSE" "view logs"
expect_json_value "$LOGS_RESPONSE" "type" "array"

printf "\nSmoke test passed for %s\n" "$BASE_URL"
