import { PublicNav } from "@/components/layout/PublicNav";
import { ButtonLink, CodeBlock } from "@/components/ui";

const productModel = [
  ["Passport", "Allowed actions, blocked actions, resources, limits."],
  ["Verify", "Decision point before execution."],
  ["Enforce", "SDK/API integration or Action Gateway stops denied actions."],
  ["Audit", "Logs and webhooks record the decision."]
];

const secondarySurfaces = [
  {
    title: "Existing assistants",
    body: "Manual passports help users share boundaries with assistants that do not integrate yet. This is guidance, not automatic enforcement.",
    cta: "Try onboarding",
    href: "/dashboard/onboarding"
  },
  {
    title: "Website access",
    body: "Site Guard is the planned website-owner path for enforcing AI access rules at middleware, worker, proxy, or gateway boundaries.",
    cta: "Read Site Guard design",
    href: "/docs/site-guard"
  }
];

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
      dateModified: "2026-05-09"
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://behalfid.com/#software",
      name: "BehalfID",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Web",
      url: "https://behalfid.com",
      description: "BehalfID helps developers define agent permissions and verify actions before AI agents act.",
      publisher: { "@id": "https://behalfid.com/#organization" },
      datePublished: "2026-05-03",
      dateModified: "2026-05-09"
    }
  ]
};

function DecisionPacket() {
  return (
    <div className="decision-packet" aria-label="Denied action decision packet">
      <div className="decision-packet__header">
        <span>Decision packet</span>
        <strong>blocked before execution</strong>
      </div>
      <div className="decision-packet__body">
        <section className="packet-pane">
          <p>ACTION REQUEST</p>
          <dl className="packet-list">
            <div><dt>agent</dt><dd>Ollie</dd></div>
            <div><dt>action</dt><dd>purchase</dd></div>
            <div><dt>vendor</dt><dd>coachella.com</dd></div>
            <div><dt>amount</dt><dd>$742</dd></div>
          </dl>
        </section>
        <div className="packet-boundary" aria-hidden="true">
          <span>BehalfID decision boundary</span>
        </div>
        <section className="packet-pane packet-pane--decision">
          <p>PASSPORT MATCH</p>
          <strong>active scope: browse_web only</strong>
          <p>DECISION</p>
          <strong className="packet-decision">denied</strong>
          <p>REASON</p>
          <strong>No active permission allows purchase.</strong>
          <p>AUDIT</p>
          <strong>verification.denied queued</strong>
        </section>
      </div>
      <div className="decision-packet__footer">
        <span>EXECUTION</span>
        <strong>false</strong>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="marketing public-site">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PublicNav />

      <section className="hero boundary-hero">
        <div className="hero__content">
          <p className="section-kicker">Agent permission infrastructure</p>
          <h1>The permission layer between agents and action.</h1>
          <p>
            Define what an agent may do, verify every action before it runs, and
            fail closed when permission is missing.
          </p>
          <div className="hero__actions">
            <ButtonLink variant="primary" href="/signup">Start building</ButtonLink>
            <ButtonLink href="/sandbox">Run sandbox</ButtonLink>
          </div>
        </div>
        <DecisionPacket />
      </section>

      <section className="marketing-section problem-section">
        <p className="section-kicker">Problem</p>
        <h2>Agents are moving from suggestions to actions.</h2>
        <p className="section-lede">
          Purchases, API calls, workflow automation, data access, and delegated user
          actions all need the same answer: is this agent allowed to do this?
        </p>
        <div className="contrast-list" aria-label="Permission model contrast">
          <p>API keys prove an integration can call your system.</p>
          <p>OAuth proves a user granted broad access.</p>
          <p>
            BehalfID models per-action delegation with resources, scopes, limits,
            approval, expiration, and revocation.
          </p>
        </div>
      </section>

      <section className="marketing-section product-model" aria-labelledby="product-model-heading">
        <p className="section-kicker">Model</p>
        <h2 id="product-model-heading">Passport. Verify. Enforce. Audit.</h2>
        <div className="product-model__diagram" aria-label="BehalfID product model">
          {productModel.map(([title, body], index) => (
            <article className="product-model__step" key={title}>
              <span>0{index + 1}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="developer-section enforcement-section" aria-labelledby="enforcement-heading">
        <div>
          <p className="section-kicker">Developer enforcement</p>
          <h2 id="enforcement-heading">Add a decision point before the agent acts.</h2>
          <p>
            Use the SDK or API to check an action before execution. For supported
            actions, route through Action Gateway so BehalfID executes only when the
            passport allows it.
          </p>
          <p className="section-note section-note--plain">
            Action Gateway currently supports safe public web reads as the MVP.
            Denied or missing permissions should fail closed before the executor runs.
          </p>
        </div>
        <div className="enforcement-console">
          <CodeBlock label="install + verify">{`npm install @behalfid/sdk

import { BehalfID } from "@behalfid/sdk";

const behalf = new BehalfID({
  apiKey: process.env.BEHALFID_API_KEY!
});

const decision = await behalf.verify({
  agentId: "agent_ollie",
  action: "purchase",
  vendor: "coachella.com",
  amount: 742
});

if (!decision.allowed) {
  throw new Error(decision.reason);
}`}</CodeBlock>
        </div>
      </section>

      <section className="marketing-section secondary-surfaces" aria-labelledby="secondary-surfaces-heading">
        <p className="section-kicker">Secondary surfaces</p>
        <h2 id="secondary-surfaces-heading">Beyond native integrations.</h2>
        <div className="secondary-surface-grid">
          {secondarySurfaces.map((surface) => (
            <article className="secondary-surface" key={surface.title}>
              <h3>{surface.title}</h3>
              <p>{surface.body}</p>
              <a href={surface.href}>{surface.cta}</a>
            </article>
          ))}
        </div>
      </section>

      <section className="final-cta trust-cta">
        <h2>Start verifying agent actions.</h2>
        <div className="hero__actions">
          <ButtonLink variant="primary" href="/signup">Start building</ButtonLink>
          <ButtonLink href="/docs/quickstart">Read quickstart</ButtonLink>
          <ButtonLink href="/sandbox">Run sandbox</ButtonLink>
        </div>
        <p>
          Manual mode is best-effort. Integrated enforcement fails closed when your app,
          gateway, middleware, worker, or provider calls BehalfID before acting.
        </p>
      </section>
    </main>
  );
}
