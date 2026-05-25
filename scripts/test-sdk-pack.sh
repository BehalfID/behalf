#!/usr/bin/env bash
# test-sdk-pack.sh — local pack smoke-test for @behalfid/sdk
# Does NOT hit the npm registry; uses a local tarball.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "→ Building SDK…"
npm --prefix "$REPO_ROOT/packages/sdk" run build

echo "→ Packing SDK…"
cd "$REPO_ROOT/packages/sdk"
npm pack --quiet
TARBALL=$(ls behalfid-sdk-*.tgz | tail -1)
TARBALL_ABS="$REPO_ROOT/packages/sdk/$TARBALL"
echo "  Packed: $TARBALL_ABS"

echo "→ Creating temp project…"
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"; rm -f "$TARBALL_ABS"' EXIT

cd "$TMPDIR"
npm init -y --quiet >/dev/null

echo "→ Installing packed tarball…"
npm install --quiet "$TARBALL_ABS"

echo "→ Running ESM smoke test…"
node --input-type=module -e "
import('@behalfid/sdk').then((m) => {
  if (typeof m.BehalfID !== 'function') {
    throw new Error('FAIL: BehalfID is ' + typeof m.BehalfID + ', expected function');
  }
  console.log('  ✓ typeof BehalfID:', typeof m.BehalfID);

  // Instantiate with a valid-format key and verify siteGuard namespace exists
  const client = new m.BehalfID({
    apiKey: 'bhf_sk_smoketest',
    baseUrl: 'https://localhost.invalid'
  });
  if (!client.siteGuard || typeof client.siteGuard.check !== 'function') {
    throw new Error('FAIL: siteGuard.check is not a function');
  }
  console.log('  ✓ siteGuard.check:', typeof client.siteGuard.check);

  // Verify verifyWebhookSignature is also exported
  if (typeof m.verifyWebhookSignature !== 'function') {
    throw new Error('FAIL: verifyWebhookSignature is ' + typeof m.verifyWebhookSignature);
  }
  console.log('  ✓ typeof verifyWebhookSignature:', typeof m.verifyWebhookSignature);
}).catch((err) => { console.error(err); process.exit(1); });
"

echo ""
echo "✓ SDK pack smoke test passed"
