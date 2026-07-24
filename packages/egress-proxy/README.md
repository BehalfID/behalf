# @behalfid/egress-proxy

> **Preview / unreleased:** This package is **not published to npm** yet.
> Do not run `npm install @behalfid/egress-proxy` or
> `npx @behalfid/egress-proxy` against the public registry. Use a local
> workspace build or packed tarball until the first release is published.
> `@behalfid/cli` lists this as an optional dependency; CLI egress features
> that require it remain preview until this package is published.

Loopback HTTP/CONNECT proxy that asks BehalfID `POST /api/egress/authorize` before forwarding.

- **CONNECT** tunnels are pass-through TCP (no MITM, no local CA).
- Modes: `advise` (log + forward on deny) and `enforce` (block on deny).

```bash
# Local / packed preview (not yet on npm):
BEHALFID_API_KEY=bhf_sk_... BEHALFID_AGENT_ID=agent_... BEHALFID_EGRESS_MODE=enforce \
  node dist/cli.js
```
