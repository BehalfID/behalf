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
      dateModified: "2026-05-13"
    }
  ]
};

export default function Home() {
  return (
    <main className="marketing public-site">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PublicNav />

      {/* ── Hero ──────────────────────────────────────────── */}
      <section className="home-hero">
        <p className="section-kicker">Agent permission infrastructure</p>
        <h1 className="home-h1">
          Verify before<br />the agent acts.
        </h1>
        <p className="home-sub">
          BehalfID checks every action against a permission passport before execution.
          If permission is missing, the action fails closed — not after.
        </p>
        <div className="home-actions">
          <SplitCTAButton leftLabel="Build" leftHref="/signup" rightLabel="Sandbox" rightHref="/sandbox" className="split-cta--ghost" />
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────── */}
      <section className="home-steps" aria-labelledby="steps-heading">
        <div className="home-steps__intro">
          <p className="section-kicker">How it works</p>
          <h2 id="steps-heading" className="home-steps__h2">
            Four moments.<br />One boundary.
          </h2>
        </div>

        <ol className="home-steps__list">

          <li className="home-step">
            <div className="home-step__left">
              <span className="home-step__num">01</span>
              <h3 className="home-step__title">Action request</h3>
              <p className="home-step__body">
                Before your executor runs, the agent packages the action — who is acting,
                what action, which vendor, and any parameters like amount or resource path.
              </p>
            </div>
            <div className="home-step__visual" aria-hidden="true">
              <span className="sv-label">ACTION REQUEST</span>
              <div className="sv-rows">
                <div><span>agent</span><code>agent_ollie</code></div>
                <div><span>action</span><code>purchase</code></div>
                <div><span>vendor</span><code>coachella.com</code></div>
                <div><span>amount</span><code>$742.00</code></div>
              </div>
            </div>
          </li>

          <li className="home-step home-step--check">
            <div className="home-step__left">
              <span className="home-step__num">02</span>
              <h3 className="home-step__title">Passport check</h3>
              <p className="home-step__body">
                BehalfID evaluates the request against the agent&apos;s active permission
                passport — the permissions, constraints, and expiry you configured.
                Every field is checked before the executor is called.
              </p>
            </div>
            <div className="home-step__visual home-step__visual--accent" aria-hidden="true">
              <span className="sv-label sv-label--accent">BEHALFID · DECISION BOUNDARY</span>
              <div className="sv-rows">
                <div><span>passport</span><code>passport_ollie</code></div>
                <div><span>active</span><code>3 permissions</code></div>
                <div><span>purchase</span><code className="sv-muted">no scope configured</code></div>
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
                <code className="hi-code">denied</code>, or{" "}
                <code className="hi-code">needs_approval</code>.
                Denied actions stop here. Your executor never runs.
              </p>
            </div>
            <div className="home-step__visual home-step__visual--deny" aria-hidden="true">
              <span className="sv-label">DECISION</span>
              <strong className="sv-verdict sv-verdict--deny">denied</strong>
              <code className="sv-reason">No active purchase permission.</code>
              <div className="sv-rows sv-rows--sm">
                <div><span>execution</span><code className="sv-muted">false</code></div>
                <div><span>requestId</span><code>req_Abc123xyz</code></div>
              </div>
            </div>
          </li>

          <li className="home-step">
            <div className="home-step__left">
              <span className="home-step__num">04</span>
              <h3 className="home-step__title">Audit event</h3>
              <p className="home-step__body">
                Every verified decision is logged with a stable request ID, the result,
                reason, and enforcement outcome — available in the dashboard and delivered
                via signed webhook.
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
            executor, and throw on denial. Works with any agent framework —
            enforcement lives in your code, not the model.
          </p>
          <div className="home-code__links">
            <Link href="/docs/quickstart">Quickstart →</Link>
            <Link href="/docs/sdk">SDK reference →</Link>
          </div>
        </div>
        <div className="home-code__block">
          <CodeBlock label="enforce.ts">{`const decision = await behalf.verify({
  agentId: "agent_ollie",
  action:  "purchase",
  vendor:  "coachella.com",
  amount:  742,
});

if (!decision.allowed) {
  throw new Error(decision.reason);
}

// Executor only runs when decision.allowed === true`}</CodeBlock>
        </div>
      </section>

      {/* ── Interactive demo ──────────────────────────────── */}
      <HomeDemo />

      {/* ── Final CTA ─────────────────────────────────────── */}
      <section className="home-cta" aria-labelledby="cta-heading">
        <p className="section-kicker">Ready</p>
        <h2 id="cta-heading" className="home-cta__h2">Add the boundary.</h2>
        <p className="home-cta__body">
          Integrated enforcement fails closed. Manual mode is best-effort for testing
          with existing agents before you integrate.
        </p>
        <div className="home-actions home-actions--center">
          <SplitCTAButton leftLabel="Build" leftHref="/signup" rightLabel="Sandbox" rightHref="/sandbox" className="split-cta--ghost" />
          <ButtonLink href="/docs/quickstart">Read quickstart</ButtonLink>
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
                <li><Link href="/security">Security</Link></li>
                <li><Link href="/blog">Blog</Link></li>
                <li><Link href="/signup">Start building</Link></li>
              </ul>
            </div>
            <div>
              <h5>Docs</h5>
              <ul>
                <li><Link href="/docs/quickstart">Quickstart</Link></li>
                <li><Link href="/docs/api">API reference</Link></li>
                <li><Link href="/docs/sdk">SDK</Link></li>
                <li><Link href="/docs/concepts">Concepts</Link></li>
                <li><Link href="/docs/action-gateway">Action Gateway</Link></li>
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
                <li><Link href="/privacy">Privacy policy</Link></li>
                <li><Link href="/security">Security</Link></li>
              </ul>
            </div>
          </nav>
        </div>
      </footer>
    </main>
  );
}
