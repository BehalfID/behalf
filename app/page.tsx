import Link from "next/link";
import type { Metadata } from "next";
import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { ButtonLink, CodeBlock, HomeDemo, FlowDiagram } from "@/components/ui";

export const metadata: Metadata = {
  title: "BehalfID — Approval gates for coding agents",
  description:
    "BehalfID stops Claude Code, Codex, and Cursor from deploying to production, running database migrations, deleting files, or calling billing APIs without your approval.",
  alternates: { canonical: "/" }
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://behalfid.com/#organization",
      name: "BehalfID",
      url: "https://behalfid.com",
      description: "BehalfID stops coding agents from deploying, deleting, or spending without your approval."
    },
    {
      "@type": "WebSite",
      "@id": "https://behalfid.com/#website",
      name: "BehalfID",
      url: "https://behalfid.com",
      description: "Approval gates for Claude Code, Codex, and Cursor.",
      publisher: { "@id": "https://behalfid.com/#organization" },
      datePublished: "2026-05-03",
      dateModified: "2026-05-18"
    }
  ]
};

export default function Home() {
  return (
    <main id="main-content" className="marketing public-site" tabIndex={-1}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PublicNav />

      {/* ── Announcement bar ─────────────────────────────── */}
      <Link href="/docs/deploy-approvals" className="announcement-bar">
        <span className="announcement-bar__dot" />
        <span><span className="announcement-bar__label">New —</span>Deploy approval workflows are live. Set up in 5 minutes.</span>
        <span className="announcement-bar__arrow">→</span>
      </Link>

      {/* ── Hero ──────────────────────────────────────────── */}
      <section className="home-hero">
        <div className="home-hero__content">
          <p className="section-kicker">For Claude Code · Codex · Cursor</p>
          <h1 className="home-h1">
            Stop coding agents<br />from running<br />dangerous commands.
          </h1>
          {/* Advanced subtitle (default) */}
          <p className="home-sub home-sub--advanced">
            Claude Code, Codex, and Cursor can deploy to production, drop databases,
            push to main, and call billing APIs. BehalfID intercepts those actions
            before they run — blocking automatically or pausing for your approval.
          </p>
          {/* Simple subtitle */}
          <p className="home-sub home-sub--simple">
            Your AI coding assistant can deploy code, delete files, and modify production.
            BehalfID lets you define which actions require approval, and blocks
            everything else before it runs.
          </p>
          <div className="home-code__links home-hero__examples" aria-label="Permission examples">
            <span>Allow staging deploys, require approval for production.</span>
            <span>Block <code>git push origin main</code> without human sign-off.</span>
            <span>Require approval before any database migration runs.</span>
          </div>
          <div className="home-actions">
            <Link href="/signup" className="home-cta-primary">Start building free →</Link>
            <Link href="/docs/cli" className="home-cta-secondary">CLI setup →</Link>
          </div>
          <div className="home-hero__stats" aria-label="Key metrics">
            <div className="home-hero__stat">
              <span className="home-hero__stat-val">&lt;50ms</span>
              <span className="home-hero__stat-label">verify latency</span>
            </div>
            <div className="home-hero__stat">
              <span className="home-hero__stat-val">fail-closed</span>
              <span className="home-hero__stat-label">denial model</span>
            </div>
            <div className="home-hero__stat">
              <span className="home-hero__stat-val">signed</span>
              <span className="home-hero__stat-label">audit webhooks</span>
            </div>
          </div>
        </div>

        {/* ── Hero terminal visual ───────────────────────── */}
        <div className="home-hero__visual" aria-hidden="true">
          <div className="hero-terminal">
            <div className="hero-terminal__bar">
              <div className="hero-terminal__dots">
                <span /><span /><span />
              </div>
              <span className="hero-terminal__title">behalf · verify</span>
              <span className="hero-terminal__badge hero-terminal__badge--live">LIVE</span>
            </div>
            <div className="hero-terminal__body">
              <div className="hero-terminal__row">
                <span className="hero-terminal__label">agent</span>
                <code className="hero-terminal__val">agent_claude_code</code>
              </div>
              <div className="hero-terminal__row">
                <span className="hero-terminal__label">action</span>
                <code className="hero-terminal__val">deploy</code>
              </div>
              <div className="hero-terminal__row">
                <span className="hero-terminal__label">vendor</span>
                <code className="hero-terminal__val">vercel.com</code>
              </div>
              <div className="hero-terminal__row">
                <span className="hero-terminal__label">env</span>
                <code className="hero-terminal__val hero-terminal__val--warn">production</code>
              </div>
              <div className="hero-terminal__divider" />
              <div className="hero-terminal__decision">
                <span className="hero-terminal__decision-label">DECISION</span>
                <strong className="hero-terminal__verdict hero-terminal__verdict--deny">denied</strong>
              </div>
              <div className="hero-terminal__row hero-terminal__row--sm">
                <span className="hero-terminal__label">reason</span>
                <code className="hero-terminal__val hero-terminal__val--muted">requires approval</code>
              </div>
              <div className="hero-terminal__row hero-terminal__row--sm">
                <span className="hero-terminal__label">executed</span>
                <code className="hero-terminal__val hero-terminal__val--deny">false</code>
              </div>
              <div className="hero-terminal__row hero-terminal__row--sm">
                <span className="hero-terminal__label">requestId</span>
                <code className="hero-terminal__val hero-terminal__val--muted">req_K9mXp2qR</code>
              </div>
            </div>
            <div className="hero-terminal__footer">
              <div className="hero-terminal__event">
                <span className="hero-terminal__event-dot" />
                <span>verification.denied</span>
                <span className="hero-terminal__event-time">just now</span>
              </div>
              <div className="hero-terminal__event">
                <span className="hero-terminal__event-dot hero-terminal__event-dot--ok" />
                <span>verification.allowed</span>
                <span className="hero-terminal__event-time">2s ago</span>
              </div>
              <div className="hero-terminal__event">
                <span className="hero-terminal__event-dot hero-terminal__event-dot--ok" />
                <span>verification.allowed</span>
                <span className="hero-terminal__event-time">4s ago</span>
              </div>
            </div>
          </div>
          <div className="home-hero__visual-glow" />
        </div>
      </section>


      {/* ── Flow diagram ─────────────────────────────────── */}
      <section className="home-flow-section">
        <div className="home-flow-section__inner">
          <p className="section-kicker">How BehalfID works</p>
          <h2 className="home-flow-section__h2">Every dangerous command passes through BehalfID — before it runs.</h2>
          <FlowDiagram />
          <div className="home-flow-section__legend">
            <span className="home-flow-legend__item home-flow-legend__item--deny">Denied — action never executes</span>
            <span className="home-flow-legend__divider">·</span>
            <span className="home-flow-legend__item home-flow-legend__item--allow">Allowed — passes through to your tool</span>
            <span className="home-flow-legend__divider">·</span>
            <span className="home-flow-legend__item">Every decision logged + signed webhook</span>
          </div>
        </div>
      </section>
      {/* ── How it works ──────────────────────────────────── */}
      <section className="home-steps" aria-labelledby="steps-heading">
        <div className="home-steps__intro" data-reveal>
          <p className="section-kicker">How it works</p>
          <h2 id="steps-heading" className="home-steps__h2">
            Verify first.<br />Execute second.
          </h2>
        </div>

        <ol className="home-steps__list">

          <li className="home-step">
            <div className="home-step__left">
              <span className="home-step__num">01</span>
              <h3 className="home-step__title">Action request</h3>
              <p className="home-step__body">
                Before your agent runs a tool, it packages the action — who is acting,
                what action, which vendor, and any parameters like environment or resource path.
              </p>
            </div>
            <div className="home-step__visual" aria-hidden="true">
              <span className="sv-label">ACTION REQUEST</span>
              <div className="sv-rows">
                <div><span>agent</span><code>agent_claude_code</code></div>
                <div><span>action</span><code>deploy</code></div>
                <div><span>vendor</span><code>vercel.com</code></div>
                <div><span>env</span><code>production</code></div>
              </div>
            </div>
          </li>

          <li className="home-step home-step--check">
            <div className="home-step__left">
              <span className="home-step__num">02</span>
              <h3 className="home-step__title">BehalfID verify</h3>
              <p className="home-step__body">
                BehalfID evaluates the request against active permissions, blocked actions,
                allowed actions, resource or vendor constraints, approval
                requirements, and expiry before the executor is called.
              </p>
            </div>
            <div className="home-step__visual home-step__visual--accent" aria-hidden="true">
              <span className="sv-label sv-label--accent">BEHALFID · DECISION BOUNDARY</span>
              <div className="sv-rows">
                <div><span>passport</span><code>passport_claude</code></div>
                <div><span>active</span><code>3 permissions</code></div>
                <div><span>deploy prod</span><code className="sv-muted">requires approval</code></div>
              </div>
            </div>
          </li>

          <li className="home-step home-step--decision">
            <div className="home-step__left">
              <span className="home-step__num">03</span>
              <h3 className="home-step__title">Decision</h3>
              <p className="home-step__body">
                A decision packet is returned:{" "}
                <code className="hi-code">allowed</code>,{" "}
                <code className="hi-code">denied</code>, or approval required.
                The tool executes only when <code className="hi-code">allowed</code> is true.
              </p>
            </div>
            <div className="home-step__visual home-step__visual--deny" aria-hidden="true">
              <span className="sv-label">DECISION</span>
              <strong className="sv-verdict sv-verdict--deny">denied</strong>
              <code className="sv-reason">Permission requires approval before execution.</code>
              <div className="sv-rows sv-rows--sm">
                <div><span>execution</span><code className="sv-muted">false</code></div>
                <div><span>requestId</span><code>req_Abc123xyz</code></div>
              </div>
            </div>
          </li>

          <li className="home-step">
            <div className="home-step__left">
              <span className="home-step__num">04</span>
              <h3 className="home-step__title">Execute and audit</h3>
              <p className="home-step__body">
                Allowed actions can continue to your tool. Denied actions stop before execution.
                Every verified decision is logged with a stable request ID and delivered via
                signed webhook.
              </p>
            </div>
            <div className="home-step__visual home-step__visual--ok" aria-hidden="true">
              <span className="sv-label sv-label--ok">AUDIT EVENT · LOGGED</span>
              <div className="sv-rows">
                <div><span>requestId</span><code>req_Abc123xyz</code></div>
                <div><span>event</span><code>verification.denied</code></div>
                <div><span>agent</span><code>agent_ollie</code></div>
                <div><span>action</span><code>purchase · $742.00</code></div>
              </div>
            </div>
          </li>

        </ol>
      </section>

      {/* ── Integration ───────────────────────────────────── */}
      <section className="home-code" aria-labelledby="code-heading">
        <div className="home-code__text" data-reveal>
          <p className="section-kicker">Integration</p>
          <h2 id="code-heading" className="home-code__h2">
            Three lines between<br />request and execution.
          </h2>
          {/* Advanced body */}
          <p className="home-code__body mode-advanced-only">
            Call <code className="hi-code">behalf.verify()</code> before your executor and throw
            on denial. Works with Claude Code, Codex, Cursor, or any custom agent because
            the fail-closed check lives in your code — not in the model&apos;s memory.
          </p>
          {/* Simple body */}
          <p className="home-code__body mode-simple-only">
            No matter which command your coding agent tries to run — deploy, delete, push,
            migrate — it asks BehalfID first. You define the rules once.
            BehalfID enforces them automatically, every time.
          </p>
          <div className="home-code__links">
            <Link href="/docs/quickstart">Quickstart →</Link>
            <Link href="/docs/sdk">SDK reference →</Link>
          </div>
        </div>

        {/* Advanced: TypeScript code snippet */}
        <div className="home-code__block mode-advanced-only" data-reveal>
          <CodeBlock label="enforce.ts">{`const decision = await behalf.verify({
  agentId: "agent_claude_code",
  action:  "deploy",
  vendor:  "vercel.com",
});

if (!decision.allowed) {
  // Blocked — reason logged, webhook fired
  throw new Error(decision.reason);
}

// Deploy only runs when decision.allowed === true`}</CodeBlock>
        </div>

        {/* Simple: visual flow diagram */}
        <div className="home-flow-diagram mode-simple-only" aria-label="BehalfID verification flow" data-reveal>
          <div className="home-flow-node">
            <span className="home-flow-node__icon" aria-hidden="true">🤖</span>
            <span className="home-flow-node__label">AI Agent</span>
            <span className="home-flow-node__sub">wants to take an action</span>
          </div>
          <div className="home-flow-node home-flow-node--center">
            <span className="home-flow-node__icon" aria-hidden="true">🛡️</span>
            <span className="home-flow-node__label">BehalfID</span>
            <span className="home-flow-node__sub">checks your rules first</span>
          </div>
          <div className="home-flow-node">
            <div className="home-flow-outcomes">
              <span className="home-flow-outcome home-flow-outcome--ok">✓ Go ahead</span>
              <span className="home-flow-outcome home-flow-outcome--deny">✗ Blocked</span>
              <span className="home-flow-outcome home-flow-outcome--warn">⚠ Ask me first</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Deploy approval workflow ──────────────────────── */}
      <section className="home-deploy" aria-labelledby="deploy-heading">
        <div className="home-deploy__intro" data-reveal>
          <p className="section-kicker">Deploy approvals</p>
          <h2 id="deploy-heading" className="home-deploy__h2">
            From zero to enforced<br />in five minutes.
          </h2>
          {/* Advanced body */}
          <p className="home-deploy__body mode-advanced-only">
            The first thing most teams wire up: a coding agent that can deploy to staging
            freely, but must pause for human approval before touching production.
            BehalfID enforces this at the MCP boundary — where the tool call is made,
            not inside the model&apos;s memory.
          </p>
          {/* Simple body */}
          <p className="home-deploy__body mode-simple-only">
            The most common setup: your AI coding helper can update the test environment
            any time, but touching the live site requires your go-ahead first. Four
            steps, set up in under five minutes.
          </p>
        </div>

        <ol className="home-deploy__steps">
          <li>
            <span className="home-deploy__num">01</span>
            <div>
              <h3>Set up two permissions</h3>
              <p>Staging allowed automatically. Production requires approval.</p>
              {/* Advanced: code */}
              <div className="mode-advanced-only">
                <CodeBlock label="terminal">{`behalf permissions create agent_xxx \\
  --action deploy --resource vercel.com \\
  --blocked "deploy to production"

behalf permissions create agent_xxx \\
  --action deploy_production --resource vercel.com \\
  --requires-approval`}</CodeBlock>
              </div>
              {/* Simple: plain card */}
              <div className="home-deploy-simple mode-simple-only">
                <div className="home-deploy-simple__card">
                  <span className="home-deploy-simple__num">A</span>
                  <div className="home-deploy-simple__text">
                    <strong>Staging — always allowed</strong>
                    <p>Your agent can push to the test environment freely, any time.</p>
                  </div>
                </div>
                <div className="home-deploy-simple__card">
                  <span className="home-deploy-simple__num">B</span>
                  <div className="home-deploy-simple__text">
                    <strong>Production — ask me first</strong>
                    <p>Production deploys pause until you approve them in the dashboard.</p>
                  </div>
                </div>
              </div>
            </div>
          </li>

          <li>
            <span className="home-deploy__num">02</span>
            <div>
              <h3>Wire up MCP enforcement</h3>
              {/* Advanced */}
              <p className="mode-advanced-only">One command writes <code>.mcp.json</code> and the agent context file.</p>
              <div className="mode-advanced-only">
                <CodeBlock label="terminal">{`behalf mcp init && behalf claude`}</CodeBlock>
              </div>
              {/* Simple */}
              <p className="mode-simple-only">
                One terminal command connects BehalfID to your AI agent&apos;s tools.
                No code changes to your agent needed.
              </p>
            </div>
          </li>

          <li>
            <span className="home-deploy__num">03</span>
            <div>
              <h3>Agent attempts production deploy — blocked</h3>
              <p>
                The MCP server calls <code className="mode-advanced-only">verify_action</code>
                <span className="mode-simple-only">BehalfID</span>
                {". "}BehalfID returns{" "}
                <code className="mode-advanced-only">approvalRequired: true</code>
                <span className="mode-simple-only">Approval Required</span>
                {". "}The agent pauses and reports back to you.
              </p>
              <CodeBlock label="what the agent sees">{`APPROVAL REQUIRED — do not execute this action.

Action:      deploy_production on vercel.com
Approval ID: apr_Def456uvw

Approve at: https://behalfid.com/dashboard/approvals`}</CodeBlock>
            </div>
          </li>

          <li>
            <span className="home-deploy__num">04</span>
            <div>
              <h3>You approve — agent retries and deploys</h3>
              {/* Advanced */}
              <p className="mode-advanced-only">
                One click in the dashboard opens a 30-minute grant window.
                The agent calls <code>verify_action</code> again — now <code>allowed: true</code>.
                The deploy runs. Every step is in the audit log.
              </p>
              {/* Simple */}
              <p className="mode-simple-only">
                Click Approve in your dashboard. The agent retries automatically and
                the deploy goes through. Every step — the block, the approval, the
                deploy — is recorded in the audit log.
              </p>
            </div>
          </li>
        </ol>

        <div className="home-deploy__cta">
          <ButtonLink href="/docs/deploy-approvals">Read the full demo guide →</ButtonLink>
        </div>
      </section>

      {/* ── Interactive demo ──────────────────────────────── */}
      <HomeDemo />

      {/* ── Final CTA ─────────────────────────────────────── */}
      <section className="home-cta" aria-labelledby="cta-heading">
        <p className="section-kicker">Get started</p>
        <h2 id="cta-heading" className="home-cta__h2">Wire up your coding agent in five minutes.</h2>
        <p className="home-cta__body">
          Enforcement works when you integrate it — via the CLI/MCP path for Claude Code and Codex,
          or via the SDK for custom agents. BehalfID only enforces what you put in the execution path.
        </p>
        <div className="home-actions home-actions--center">
          <Link href="/signup" className="home-cta-primary">Start building free</Link>
          <Link href="/docs/cli" className="home-cta-secondary">CLI &amp; MCP setup →</Link>
          <ButtonLink href="/docs/deploy-approvals">Deploy approvals →</ButtonLink>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
