import { headers } from "next/headers";
import { PublicNav } from "@/components/layout/PublicNav";
import { ButtonLink, CodeBlock } from "@/components/ui";

const productModel = [
  ["Action request", "Agent, action, resource, vendor, amount, and route are packaged before execution."],
  ["Decision boundary", "BehalfID verifies the request against the active passport before the tool runs."],
  ["Execution state", "Allowed actions continue. Denied or missing permissions fail closed."],
  ["Audit event", "The decision, reason, and enforcement result are recorded for review and webhooks."]
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

const problemSignals = [
  ["API key", "integration can call"],
  ["OAuth grant", "user delegated broad access"],
  ["Agent action", "specific operation still needs a boundary"]
];

const enforcementRows = [
  ["Verify endpoint", "Check an action before your executor runs."],
  ["SDK guard", "Throw or branch when decision.allowed is false."],
  ["Action Gateway", "MVP supports safe public web reads through a controlled executor."],
  ["Webhooks + logs", "Record allowed, denied, and approval-required decisions."]
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
    <div className="decision-boundary-primitive" aria-label="Decision packet crossing BehalfID boundary">
      <div className="primitive-stream primitive-stream--request">
        <span>ACTION REQUEST</span>
        <strong>purchase</strong>
        <code>agent: agent_ollie</code>
        <code>vendor: coachella.com</code>
        <code>amount: $742</code>
      </div>

      <div className="primitive-boundary" aria-hidden="true">
        <span>BEHALFID DECISION BOUNDARY</span>
      </div>

      <div className="primitive-stream primitive-stream--decision">
        <span>DECISION</span>
        <strong>denied</strong>
        <code>No active purchase permission</code>
      </div>

      <div className="primitive-ledger">
        <div>
          <span>EXECUTION STATE</span>
          <strong>false</strong>
        </div>
        <div>
          <span>AUDIT EVENT</span>
          <strong>verification.denied</strong>
        </div>
      </div>
    </div>
  );
}

export default async function Home() {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <main className="marketing public-site">
      <script
        type="application/ld+json"
        nonce={nonce}
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

      <section className="marketing-section problem-section" aria-labelledby="problem-heading">
        <div>
          <p className="section-kicker">Problem</p>
          <h2 id="problem-heading">Agents now need runtime permission checks.</h2>
          <p className="section-lede">
            Purchases, API calls, workflow automation, data access, and delegated user
            actions all need the same answer before execution: is this specific action allowed?
          </p>
        </div>
        <div className="signal-table" aria-label="Current authorization signals">
          {problemSignals.map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="marketing-section product-model" aria-labelledby="product-model-heading">
        <p className="section-kicker">Model</p>
        <h2 id="product-model-heading">The decision packet is the primitive.</h2>
        <div className="boundary-flow" aria-label="BehalfID product model">
          {productModel.map(([title, body], index) => (
            <article className="boundary-flow__step" key={title}>
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
          <div className="enforcement-rows" aria-label="Enforcement surfaces">
            {enforcementRows.map(([label, body]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{body}</strong>
              </div>
            ))}
          </div>
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
        <h2 id="secondary-surfaces-heading">Useful surfaces, with the boundary made explicit.</h2>
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
        <p className="section-kicker">Ready</p>
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
