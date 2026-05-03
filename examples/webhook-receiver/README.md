# BehalfID Webhook Receiver

Minimal Node.js receiver that verifies BehalfID webhook signatures.

```bash
npm --prefix examples/webhook-receiver install
BEHALFID_WEBHOOK_SECRET=whsec_xxx npm --prefix examples/webhook-receiver start
```

Use a tunnel such as ngrok for hosted BehalfID deployments. For local development, BehalfID allows `http://localhost` webhook URLs.

The receiver uses the published `@behalfid/sdk` package, verifies the raw request body, and prints only event type and event ID. It does not print webhook secrets or API keys.
