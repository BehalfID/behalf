# BehalfID Brand Context — X Posting Guide

## What BehalfID Is

BehalfID is **permission infrastructure for AI agents**. Developers use it to define what an agent may do, verify every action before it runs, and fail closed when permission is missing.

Tagline: "The permission layer between agents and action."

Website: https://behalfid.com

## The Core Problem We Solve

Agents now act on behalf of people: they purchase, book, email, call APIs, read data, automate workflows. The current authorization primitives — API keys, OAuth grants — don't answer the question that actually matters at runtime: **is this specific action, for this specific agent, allowed right now?**

BehalfID adds a decision boundary before the tool runs.

## The Product Model (4 steps)

1. **Action request** — agent, action, resource, vendor, amount, and route are packaged before execution.
2. **Decision boundary** — BehalfID verifies the request against the active passport before the tool runs.
3. **Execution state** — allowed actions continue; denied or missing permissions fail closed.
4. **Audit event** — the decision, reason, and enforcement result are recorded for review and webhooks.

## Key Concepts

- **Passport** — the set of permissions tied to an agent
- **Verify** — the API call that returns `allowed: true/false` + `reason` before execution
- **Fail closed** — if no permission exists, the action does not run; there is no permissive default
- **Native agent** — a BehalfID-created identity for a custom agent integration
- **Connected agent** — manually represents an external agent (Claude, ChatGPT, Zapier, etc.) the user already has
- **Action Gateway** — BehalfID executes the action only when the passport allows it
- **Site Guard** — the planned pattern for website owners to enforce AI access rules at their perimeter

## What Developers Can Do Today

- Create agents and store hashed API keys
- Define permission rules (action, vendor, amount, expiration)
- Call `/api/verify` or use the SDK before any tool runs
- Inspect audit logs with `requestId` for every decision
- Receive signed webhooks for verification.allowed, verification.denied, agent changes, and permission changes
- Use the dashboard to manage agents, permissions, logs, and webhook endpoints
- Use the SDK: `npm install @behalfid/sdk`

## Brand Voice

- **Technical and precise** — our audience is developers. Use real terms: verify, action, vendor, permission, passport, SDK, fail closed.
- **Problem-first** — lead with the real-world pain, not the solution.
- **No hype** — never say "revolutionary", "game-changing", "next-gen", "disruptive", or "powerful".
- **No exclamation points** — ever.
- **Lowercase-friendly** — sentence case for headlines, don't shout.
- **Short** — under 240 characters preferred. Dense, not padded.
- **Honest about early stage** — we are building in public, not pretending to be finished.
- **Confident but not arrogant** — we believe in the problem; we don't pretend we've solved everything.

## Tone Examples (good)

- "Your agent bought something you never approved. That's the gap BehalfID closes."
- "An API key says an integration can call. It doesn't say what it's allowed to do."
- "fail closed means: if there's no permission, the action never runs. No permissive default."
- "Agents need a runtime permission check, not just an auth token at setup time."
- "behalfid.com — define what your agent may do before it acts."
- "The audit trail starts before execution, not after the mistake."

## Tone Anti-Examples (bad)

- "BehalfID is the revolutionary AI permission platform changing the future of agentic AI!"
- "We're excited to announce..."
- "Powerful new feature just dropped"
- "Game-changing infrastructure for the AI age"

## Post Topic Areas

Rotate through these categories. Don't repeat the same topic back-to-back.

1. **Real-world agent failure modes** — what happens when agents act without permissions
2. **The verify pattern** — short code snippets or concepts from the SDK
3. **Conceptual distinctions** — API key vs. permission vs. passport; auth vs. authorization
4. **Industry observation** — what's missing in how people think about agent safety/governance
5. **Product surface** — specific features: audit logs, webhooks, fail-closed, action gateway
6. **Builder perspective** — honest notes on building this infrastructure
7. **Questions/engagement** — ask what developers are doing about agent permissions today

## X Handle

@behalfid (or current handle — check past posts)

## What to Avoid

- Never promise features that aren't shipped yet as if they are shipped
- Never mention specific competitor products by name
- Never post more than once on the exact same topic angle in a row
- Don't pad tweets with filler: "In today's world...", "As AI continues to grow..."
- No emoji spam — zero to one emoji max, only if it genuinely aids clarity
- No hashtag spam — at most one relevant hashtag (#AIAgents or #AgentSecurity if truly relevant)
