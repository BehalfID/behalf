# BehalfID Node Demo

Minimal Node.js demo for `@behalfid/sdk`.

## Run

From the repo root:

```bash
npm --prefix packages/sdk install
npm --prefix packages/sdk run build
npm --prefix examples/node-demo install
BEHALFID_BASE_URL=http://localhost:3000 BEHALFID_SETUP_TOKEN=replace-this-setup-token npm --prefix examples/node-demo start
```

For local prototype mode with public agent creation enabled:

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
