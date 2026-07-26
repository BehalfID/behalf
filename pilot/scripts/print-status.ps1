# Prints Phase 3 pilot canary status (all live steps PENDING until human evidence exists).
# Usage: pwsh -File pilot/scripts/print-status.ps1

$ErrorActionPreference = "Stop"

$steps = @(
  "A1-A4 Allow test",
  "D1-D4 Deny test",
  "P1-P3 Approval-required test",
  "I1-I3 Separate requester/approver identities",
  "G1-G6 Approval grant tests",
  "N1-N4 Approval denial tests",
  "T1-T3 Timeout tests (hook fail-open; mcp-runtime fail-closed)",
  "O1-O5 Network/config outage tests",
  "Evidence template completion",
  "Rollback execution",
  "Kill-switch readiness / drill"
)

Write-Host "BehalfID pilot canary status"
Write-Host "Package claim: NO live pilot pass"
Write-Host "Commit under test tip should be recorded by operator; this script does not assert PASS."
Write-Host ""

foreach ($s in $steps) {
  Write-Host ("[PENDING] {0}" -f $s)
}

Write-Host ""
Write-Host "See pilot/CHECKLIST.md and pilot/EXPECTED_OUTCOMES.md"
Write-Host "Fill pilot/EVIDENCE_TEMPLATE.md before changing any status to PASS."
