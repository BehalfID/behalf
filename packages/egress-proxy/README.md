# @behalfid/egress-proxy

Loopback HTTP/CONNECT proxy that asks BehalfID `POST /api/egress/authorize` before forwarding.

- **CONNECT** tunnels are pass-through TCP (no MITM, no local CA).
- Modes: `advise` (log + forward on deny) and `enforce` (block on deny).

```bash
BEHALFID_API_KEY=bhf_sk_... BEHALFID_AGENT_ID=agent_... BEHALFID_EGRESS_MODE=enforce \
  node dist/cli.js
```
