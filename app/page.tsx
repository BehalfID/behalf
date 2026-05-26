import Link from "next/link";
import type { Metadata } from "next";
import { PublicNav } from "@/components/layout/PublicNav";
import { ButtonLink, CodeBlock, HomeDemo, SplitCTAButton } from "@/components/ui";

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
        <p className="home-sub">
          AI agents are starting to buy, email, book, edit, browse, and access data.
          API keys identify the agent. BehalfID verifies what the agent is allowed to do
          before the tool runs. Denied actions fail closed.
        </p>
        <div className="home-code__links" aria-label="Permission examples">
          <span>Allow staging deploys, require approval for production.</span>
          <span>Allow GitHub issue reads, deny production deploys.</span>
          <span>Allow browsing, deny purchases over $25.</span>
        </div>
        <div className="home-actions">
          <SplitCTAButton leftLabel="Build" leftHref="/signup" rightLabel="Try It" rightHref="/sandbox" className="split-cta--ghost" />
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────── */}
      <section className="home-steps" aria-labelledby="steps-heading">
        <div className="home-steps__intro">
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
        <div className="home-code__text">
          <p className="section-kicker">Integration</p>
          <h2 id="code-heading" className="home-code__h2">
            Three lines between<br />request and execution.
          </h2>
          <p className="home-code__body">
            Install the SDK, call <code className="hi-code">behalf.verify()</code> before your
            executor, and throw on denial. Works with any agent framework because the
            fail-closed check lives in your code, not in the model&apos;s memory.
          </p>
          <div className="home-code__links">
            <Link href="/docs/quickstart">Quickstart →</Link>
            <Link href="/docs/sdk">SDK reference →</Link>
          </div>
        </div>
        <div className="home-code__block">
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
      </section>

      {/* ── Deploy approval workflow ──────────────────────── */}
      <section className="home-deploy" aria-labelledby="deploy-heading">
        <div className="home-deploy__intro">
          <p className="section-kicker">Deploy approvals</p>
          <h2 id="deploy-heading" className="home-deploy__h2">
            From zero to enforced<br />in five minutes.
          </h2>
          <p className="home-deploy__body">
            The first thing most teams wire up: a coding agent that can deploy to staging
            freely, but must pause for human approval before touching production.
            BehalfID enforces this at the MCP boundary — where the tool call is made,
            not inside the model&apos;s memory.
          </p>
        </div>

        <ol className="home-deploy__steps">
          <li>
            <span className="home-deploy__num">01</span>
            <div>
              <h3>Set up two permissions</h3>
              <p>Staging allowed automatically. Production requires approval.</p>
              <CodeBlock label="terminal">{`behalf permissions create agent_xxx \\
  --action deploy --resource vercel.com \\
  --blocked "deploy to production"

behalf permissions create agent_xxx \\
  --action deploy_production --resource vercel.com \\
  --requires-approval`}</CodeBlock>
            </div>
          </li>

          <li>
            <span className="home-deploy__num">02</span>
            <div>
              <h3>Wire up MCP enforcement</h3>
              <p>One command writes <code>.mcp.json</code> and the agent context file.</p>
              <CodeBlock label="terminal">{`behalf mcp init && behalf claude`}</CodeBlock>
            </div>
          </li>

          <li>
            <span className="home-deploy__num">03</span>
            <div>
              <h3>Agent attempts production deploy — blocked</h3>
              <p>
                The MCP server calls <code>verify_action</code>. BehalfID returns{" "}
                <code>approvalRequired: true</code>. The agent pauses and reports the{" "}
                <code>approvalId</code> back to you.
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
              <p>
                One click in the dashboard opens a 30-minute grant window.
                The agent calls <code>verify_action</code> again — now <code>allowed: true</code>.
                The deploy runs. Every step is in the audit log.
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
          <SplitCTAButton leftLabel="Build" leftHref="/signup" rightLabel="Try It" rightHref="/sandbox" className="split-cta--ghost" />
          <ButtonLink href="/docs/deploy-approvals">Try deploy approvals</ButtonLink>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────── */}
      <footer className="site-footer">
        <div className="site-footer__inner">
          <div className="site-footer__brand">
            <Link href="/" className="site-footer__logo">
              Behalf<span>ID</span>
            </Link>
            <p className="site-footer__tagline">
              Permission infrastructure<br />for AI agents.
            </p>
            <p className="site-footer__copy">© 2026 BehalfID</p>
          </div>
          <nav className="site-footer__cols" aria-label="Footer navigation">
            <div>
              <h5>Product</h5>
              <ul>
                <li><Link href="/sandbox">Sandbox</Link></li>
                <li><Link href="/design-partners">Design partners</Link></li>
                <li><Link href="/security">Security</Link></li>
                <li><Link href="/blog">Blog</Link></li>
                <li><Link href="/signup">Start building</Link></li>
              </ul>
            </div>
            <div>
              <h5>Docs</h5>
              <ul>
                <li><Link href="/docs/quickstart">Quickstart</Link></li>
                <li><Link href="/docs/deploy-approvals">Deploy approvals</Link></li>
                <li><Link href="/docs/cli">CLI &amp; MCP</Link></li>
                <li><Link href="/docs/api">API reference</Link></li>
                <li><Link href="/docs/sdk">SDK</Link></li>
              </ul>
            </div>
            <div>
              <h5>Design</h5>
              <ul>
                <li><Link href="/design-system">Design system</Link></li>
                <li><Link href="/design-system/brand">Brand</Link></li>
                <li><Link href="/design-system/components">Components</Link></li>
                <li><Link href="/design-system/patterns">Patterns</Link></li>
              </ul>
            </div>
            <div>
              <h5>Legal</h5>
              <ul>
                <li><Link href="/legal">Legal hub</Link></li>
                <li><Link href="/terms">Terms of Service</Link></li>
                <li><Link href="/privacy">Privacy policy</Link></li>
                <li><Link href="/security">Security</Link></li>
                <li><Link href="/compliance">Compliance</Link></li>
              </ul>
            </div>
          </nav>
        </div>
      </footer>
    </main>
  );
}
