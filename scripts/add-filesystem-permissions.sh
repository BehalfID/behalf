#!/usr/bin/env bash
# add-filesystem-permissions.sh
#
# Adds the two filesystem permissions that the Claude Code PreToolUse hook
# (`behalf hook pre-tool-use`) actually verifies against:
#
#   Write / Edit / MultiEdit  ->  action "write_file"  on resource "filesystem"
#   Read                      ->  action "read_file"   on resource "filesystem"
#
# The older "create_content" permission does not match these action strings, so
# Write/Read tool calls fall through to "No active permission exists for this
# action." This script creates matching permissions via POST /api/permissions
# using the agent API key (per docs/API.md).
#
# Usage:
#   BEHALFID_API_KEY=bhf_sk_xxx ./scripts/add-filesystem-permissions.sh
#   BEHALFID_API_KEY=bhf_sk_xxx ./scripts/add-filesystem-permissions.sh --dry-run
#
# Env vars:
#   BEHALFID_API_KEY   (required)  agent API key for the target agent
#   BEHALFID_AGENT_ID  (optional)  defaults to agent_TM0ri5LikahxV6jt
#   BEHALFID_BASE_URL  (optional)  defaults to https://behalfid.com
#
# NOTE ON blockedActions: BehalfID's /api/verify blocks an action only when the
# *incoming action string* equals a blockedActions entry (see lib/verify.ts).
# The PreToolUse hook sends the literal action "write_file"/"read_file" with no
# file path, so descriptive entries like "write .env files" are recorded on the
# permission (and shown on the passport) but are NOT enforced at runtime today.
# Enforcing path-level blocks would require the hook to extract and send the
# target path. These entries are included to match the requested policy intent.

set -euo pipefail

BASE_URL=${BEHALFID_BASE_URL:-https://behalfid.com}
AGENT_ID=${BEHALFID_AGENT_ID:-agent_TM0ri5LikahxV6jt}
DRY_RUN=false
[ "${1:-}" = "--dry-run" ] && DRY_RUN=true

if [ -z "${BEHALFID_API_KEY:-}" ]; then
  echo "error: BEHALFID_API_KEY is required (the agent API key for ${AGENT_ID})." >&2
  exit 1
fi

BASE_URL=${BASE_URL%/}

write_file_payload() {
  cat <<JSON
{
  "agentId": "${AGENT_ID}",
  "action": "write_file",
  "resource": "filesystem",
  "scope": "Write/edit local files (Claude Code Write/Edit/MultiEdit)",
  "description": "Allow file writes; intended to block recursive delete and secret files",
  "requiresApproval": false,
  "template": "create_content",
  "blockedActions": ["recursive delete", "write .env files", "write credentials files"]
}
JSON
}

read_file_payload() {
  cat <<JSON
{
  "agentId": "${AGENT_ID}",
  "action": "read_file",
  "resource": "filesystem",
  "scope": "Read local files (Claude Code Read)",
  "description": "Allow file reads; intended to block reading secret files",
  "requiresApproval": false,
  "template": "access_data",
  "blockedActions": ["read .env files", "read credentials files"]
}
JSON
}

post_permission() {
  local label=$1 payload=$2
  echo "[perm] ${label} -> POST ${BASE_URL}/api/permissions"
  if [ "$DRY_RUN" = true ]; then
    echo "$payload"
    echo "[perm] (dry-run: not sent)"
    return 0
  fi
  curl -sS -X POST "${BASE_URL}/api/permissions" \
    -H "Authorization: Bearer ${BEHALFID_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "$payload"
  echo
}

echo "[perm] agent:    ${AGENT_ID}"
echo "[perm] base URL: ${BASE_URL}"
echo "[perm] dry-run:  ${DRY_RUN}"
echo "[perm] note: re-running creates duplicate permission records; the API does not de-duplicate."
echo

post_permission "write_file / filesystem" "$(write_file_payload)"
post_permission "read_file / filesystem"  "$(read_file_payload)"

echo
echo "[perm] Done. Verify end-to-end with:"
echo "       behalf mcp init --refresh && behalf claude"
echo "       # then ask Claude to: create a file called hello.txt"
echo "       # confirm in logs (action=write_file, vendor=filesystem, allowed=true):"
echo "       curl -sS \"${BASE_URL}/api/logs/${AGENT_ID}?action=write_file&allowed=true\" \\"
echo "            -H \"Authorization: Bearer \$BEHALFID_API_KEY\""
