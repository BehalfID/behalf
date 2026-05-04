# BehalfID Enforcement Demo

Demonstrates the core enforcement pattern:

> Agents must call BehalfID before acting. Denied actions fail closed.

## What this proves

The `enforceAction` helper calls `behalf.verify()` before any action proceeds. If
BehalfID returns `allowed: false`, `enforceAction` throws immediately — the agent
never reaches the code that would have executed the action.

Three scenarios are tested:

| # | Action | Vendor | Expected |
|---|--------|--------|----------|
| 1 | `browse_web` | `web` | Allowed (if permission exists) |
| 2 | `purchase` | `coachella.com` | Denied — no purchase permission |
| 3 | `send_message` | `slack.com` | Denied — no send_message permission |

## What "fail closed" means

When `enforceAction` denies an action it throws an error. Any code after the throw
in that try-block does not run — the agent is stopped before it can act. If
BehalfID is unavailable or returns an error, the same throw behavior applies: the
agent stops rather than proceeding without a decision.

The opposite would be "fail open": proceeding if the check fails. BehalfID's
enforcement pattern is always fail closed.

## Expected output

With only a `browse_web` permission on `web` active:

```
BehalfID enforcement demo
Agent:    agent_xxx
Instance: https://behalfid.vercel.app

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

## Setup

### 1. Create a BehalfID account and agent

1. Sign up at `/signup`.
2. Open `/dashboard/onboarding` and create an agent.
3. Store the one-time API key — it is shown once.

### 2. Create the browse_web permission

In `/dashboard/agents/[agentId]`, create a permission using the **Browse web** scope template:

- Scope template: `Browse web`
- Action: `browse_web`
- Resource / service: `web`
- Allowed actions: `search web, read public pages, extract structured data`
- Blocked actions: `submit forms, make purchases, login to accounts`
- Requires approval: `No`

This is the only permission the demo expects to be allowed. Do **not** create a
`purchase` or `send_message` permission — the demo tests that those are denied.

### 3. Configure environment

```bash
cp .env.example .env
```

Fill in:

```env
BEHALFID_API_KEY=bhf_sk_...      # from agent creation
BEHALFID_AGENT_ID=agent_...      # from /dashboard/agents
BEHALFID_BASE_URL=https://behalfid.vercel.app
```

For a local instance use `BEHALFID_BASE_URL=http://localhost:3000`.

## How to run

```bash
npm install
npm start
```

Or inline:

```bash
BEHALFID_API_KEY=bhf_sk_... BEHALFID_AGENT_ID=agent_... npm start
```

## The enforce pattern in your own code

```js
import { BehalfID } from "@behalfid/sdk";

const behalf = new BehalfID({ apiKey: process.env.BEHALFID_API_KEY });

async function enforceAction(input) {
  const result = await behalf.verify({ agentId: process.env.BEHALFID_AGENT_ID, ...input });
  if (!result.allowed) {
    throw new Error(`Action blocked by BehalfID: ${result.reason}`);
  }
  return result;
}

// Agent calls this before every external action.
await enforceAction({ action: "access_data", vendor: "gmail.com" });
// Only reaches here if BehalfID allowed it.
```

For automatic enforcement in production, integrate this pattern in your agent's
action dispatch layer so every action is gated before it runs.
