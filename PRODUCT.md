# Product

## Register

product

## Users

Infrastructure-aware developers and engineering teams deploying AI agents in production. Primary persona: backend/platform engineers who need to know that their agents cannot exceed defined scopes — before an action executes, not after. Secondary: security and compliance leads evaluating AI agent risk surface. Users think in terms of permissions, policies, audit logs, and failure modes — not "AI magic".

## Product Purpose

BehalfID is agent permission infrastructure. It verifies every agent action against a scoped permission passport before execution — at the SDK or MCP boundary, in the user's code, not inside the model's memory. Denied actions fail closed. Every decision is logged with a stable request ID and delivered via signed webhook. The core value: certainty that agents cannot exceed what you explicitly permitted.

## Brand Personality

Precise. Restrained. Trustworthy.

BehalfID sounds like the team that built the permission layer for a critical system — confident in what it does, quiet about what it doesn't. It never oversells. It never uses AI buzzwords. The product earns trust through specificity: named field names, real request IDs, concrete latency numbers, actual code.

## Anti-references

- Generic AI SaaS landing pages: oversized "hero" with vague tagline, 3 animated feature cards, "Join 10,000+ teams" social proof
- Purple-gradient "power" UI with decorative orbs
- Pastel rounded cards with emoji icons and buzzword body copy
- Dashboard templates with giant KPI numbers, random data viz, and no operational clarity
- "Vibe-coded" output: random gradients, inconsistent radius, no spacing system

## Design Principles

1. **Infrastructure earns trust through specificity.** Show real field names, actual request IDs, concrete latency numbers. No vague claims. Every UI surface should feel like it was built by the same team that built the API.

2. **Fail-closed UI.** Destructive actions are clearly dangerous. Denied states are semantically correct (red, not neutral grey). Pending states are distinct from idle. Nothing is accidentally permissive in appearance.

3. **Density serves clarity.** The dashboard is a control plane, not a landing page. Pack useful information — but only useful information. Whitespace should be intentional pause, not filler.

4. **Consistency is the premium signal.** Every route should look like it was designed by the same person on the same day. Inconsistent radius, shadow, or spacing reads as unfinished.

5. **Copy earns its place.** Every word either informs a decision or confirms an action. Remove everything else. No "powerful", "intelligent", or "next-gen". Use the product's actual vocabulary: verify, permit, deny, passport, scope, agent, audit.

## Accessibility & Inclusion

WCAG AA minimum. Keyboard navigation complete for all interactive surfaces. Focus rings visible at all times (not just on keyboard). Forms have programmatically associated labels. Reduced motion respected — no essential information gated on animation.
