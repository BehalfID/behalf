import Link from "next/link";
import type { Metadata } from "next";
import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { ButtonLink, CodeBlock, HomeDemo } from "@/components/ui";
import { HomeTour } from "@/components/ui/HomeTour";

export const metadata: Metadata = {
  title: "BehalfID — Permission infrastructure for AI agents",
  description:
    "BehalfID verifies every agent action against a permission passport before it runs. Define boundaries, fail closed on denial, audit every decision.",
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
      description: "BehalfID builds permission infrastructure for AI agents."
    },
    {
      "@type": "WebSite",
      "@id": "https://behalfid.com/#website",
      name: "BehalfID",
      url: "https://behalfid.com",
      description: "The permission layer between agents and action.",
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

      {/* ── Hero ──────────────────────────────────────────── */}
      <section className="home-hero">
        <p className="section-kicker">Agent permission infrastructure</p>
        <h1 className="home-h1">
          Permission checks<br />before AI agents act.
        </h1>
        {/* Advanced subtitle (default) */}
        <p className="home-sub home-sub--advanced">
          AI agents are starting to buy, email, book, edit, browse, and access data.
          API keys identify the agent. BehalfID verifies what the agent is allowed to do
          before the tool runs. Denied actions fail closed.
        </p>
        {/* Simple subtitle */}
        <p className="home-sub home-sub--simple">
          Your AI assistant can now take real actions — send emails, make purchases,
          deploy code. BehalfID lets you decide exactly which ones are okay, and blocks
          everything else before it runs.
        </p>
        <div className="home-code__links" aria-label="Permission examples">
          <span>Allow staging deploys, require approval for production.</span>
          <span>Allow GitHub issue reads, deny production deploys.</span>
          <span>Allow browsing, deny purchases over $25.</span>
        </div>
        <div className="home-actions">
          <Link href="/signup" className="home-cta-primary">Get started</Link>
          <Link href="/sandbox" className="home-cta-secondary">Try it live</Link>
          <HomeTour />
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
            Install the SDK, call <code className="hi-code">behalf.verify()</code> before your
            executor, and throw on denial. Works with any agent framework because the
            fail-closed check lives in your code, not in the model&apos;s memory.
          </p>
          {/* Simple body */}
          <p className="home-code__body mode-simple-only">
            No matter what tool your AI agent tries to use — browse, buy, deploy, email —
            it asks BehalfID first. You define the rules once. BehalfID enforces them
            automatically, every time.
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
        <p className="section-kicker">Ready</p>
        <h2 id="cta-heading" className="home-cta__h2">Add the permission check.</h2>
        <p className="home-cta__body">
          Enforcement is fail-closed where you integrate it — via SDK or MCP.
          Manual passport mode is best-effort for testing with existing agents before you build the integration.
        </p>
        <div className="home-actions home-actions--center">
          <Link href="/signup" className="home-cta-primary">Get started</Link>
          <Link href="/sandbox" className="home-cta-secondary">Try it live</Link>
          <ButtonLink href="/docs/deploy-approvals">Deploy approvals →</ButtonLink>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
