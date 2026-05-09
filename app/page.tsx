import { PublicNav } from "@/components/layout/PublicNav";
import { ButtonLink, CodeBlock } from "@/components/ui";

const badges = ["Fail-closed enforcement", "SDK on npm", "Permission passports", "Signed webhooks"];

const features = [
  "Fail-closed enforcement",
  "Scoped permissions",
  "Audit logs",
  "Signed webhooks",
  "Durable outbox",
  "Dead-letter queue",
  "JavaScript SDK",
  "Developer dashboard"
];

const flowSteps = [
  {
    title: "Add agent",
    body: "Create a native agent or connect an external agent your users already rely on."
  },
  {
    title: "Define permissions",
    body: "Define what an agent can do, what it can access, and what limits apply."
  },
  {
    title: "Verify before acting",
    body: "Call BehalfID before the agent spends money, calls APIs, or accesses data. Denied actions throw — the agent stops."
  },
  {
    title: "Audit + webhook event",
    body: "Record the decision and deliver signed events through the durable outbox."
  }
];

const connectedAgents = [
  ["Ollie", "Represent a personal assistant and scope planning, data, or transaction actions."],
  ["ChatGPT agent", "Use a manual passport to describe allowed scope for a ChatGPT-powered workflow."],
  ["Claude agent", "Share scoped instructions for Claude workflows until an app or provider enforces them."],
  ["Zapier / Make", "Wrap automations in action-level constraints and audit trails."],
  ["Custom agents", "Use native BehalfID agents for LangChain, OpenAI, or internal systems."]
];

const solutionCards = [
  {
    label: "01 / Developer systems",
    title: "Enforce actions in your app",
    body: "Use the SDK, Verify API, and Action Gateway to check agent actions before they execute.",
    motif: "pipeline",
    outcome: "Denied actions fail closed before the executor runs.",
    links: [
      ["SDK", "/docs/sdk"],
      ["API", "/docs/api"],
      ["Action Gateway", "/docs/action-gateway"]
    ]
  },
  {
    label: "02 / Existing assistants",
    title: "Set boundaries for assistants you already use",
    body: "Describe what an assistant can do, review a draft passport, and share manual-mode instructions or passport links.",
    motif: "passport",
    outcome: "Manual passports guide assistants that do not integrate yet.",
    links: [
      ["Try onboarding", "/dashboard/onboarding"],
      ["Passports", "/docs/concepts"],
      ["Sandbox", "/sandbox"]
    ]
  },
  {
    label: "03 / Website access",
    title: "Control how agents access your site",
    body: "Site Guard moves beyond robots.txt-style hints toward enforceable rules at middleware, worker, or gateway boundaries.",
    motif: "routes",
    outcome: "Site Guard requires an enforcement point such as middleware, a worker, or a gateway.",
    links: [
      ["Site Guard", "/docs/site-guard"],
      ["Security", "/security"]
    ]
  }
];

const whatBehalfIDStops = [
  ["Out-of-scope purchases", "An agent allowed to browse cannot spend money. The purchase call throws before the transaction runs."],
  ["Unauthorized data access", "Read-only permissions block write, delete, and export actions before they reach your APIs."],
  ["Unapproved messages", "Require approval before an agent sends email or posts to Slack."],
  ["Expired actions", "Permissions expire. An agent that was allowed this morning can be denied this afternoon."],
  ["Revoked agents", "Disable an agent instantly. All subsequent verify calls return denied."],
  ["Actions with no permission", "If no active permission covers the action, the agent stops. No permission means no access."]
];

const scopeCategories = [
  ["Data access", "Read email, browse web, query CRM records."],
  ["Communication", "Send email, post to Slack, draft messages."],
  ["Scheduling", "Suggest times, create calendar events, book meetings."],
  ["Commerce", "Purchase under amount limits, create invoices, issue refunds."],
  ["Content", "Write documents, generate summaries, edit records."],
  ["Admin", "Update CRM contacts, manage tickets, automate workflows."]
];

const siteGuardCapabilities = [
  ["Read public pages", "Allow summaries and citations for public routes."],
  ["Block protected actions", "Deny form submissions, checkout, login, account creation, or admin workflows."],
  ["Require identity later", "Use verified BehalfID agent credentials for sensitive site actions when available."]
];

const faqs = [
  {
    question: "What is BehalfID?",
    answer: "BehalfID is permission infrastructure for AI agents. It lets teams define explicit permission passports and verify actions before agents act."
  },
  {
    question: "How does BehalfID enforce agent permissions?",
    answer: "A developer integration calls BehalfID before an action runs. If BehalfID denies the request, the integration should fail closed and stop before executing the action."
  },
  {
    question: "Does BehalfID control ChatGPT, Claude, or Gemini automatically?",
    answer: "No. Manual mode helps existing assistants understand allowed scopes, but it is best-effort. Automatic enforcement requires an app, agent, SDK integration, gateway, middleware, or provider to call BehalfID before acting."
  },
  {
    question: "What is a permission passport?",
    answer: "A permission passport is a readable set of allowed actions, blocked actions, resources, limits, and expiration rules for an AI agent."
  },
  {
    question: "What is BehalfID Site Guard?",
    answer: "Site Guard is a planned AI access gateway for website owners. It is designed to enforce site rules when installed as middleware, a worker, proxy, or gateway."
  },
  {
    question: "How is BehalfID different from robots.txt or llms.txt?",
    answer: "robots.txt and llms.txt-style files declare preferences. BehalfID is designed for enforcement when software calls its API before an agent or automation acts."
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
      description: "BehalfID builds permission passport infrastructure for AI agents."
    },
    {
      "@type": "WebSite",
      "@id": "https://behalfid.com/#website",
      name: "BehalfID",
      url: "https://behalfid.com",
      description: "Permission passports for AI agents.",
      publisher: { "@id": "https://behalfid.com/#organization" },
      datePublished: "2026-05-03",
      dateModified: "2026-05-08"
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
      dateModified: "2026-05-08"
    },
    {
      "@type": "FAQPage",
      "@id": "https://behalfid.com/#faq",
      mainEntity: faqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: faq.answer
        }
      }))
    }
  ]
};

export default function Home() {
  return (
    <main className="marketing">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PublicNav />

      <section className="hero">
        <div className="hero__content">
          <p className="section-kicker">Agent permission infrastructure</p>
          <h1>Permission passports for AI agents.</h1>
          <p>
            Agents call BehalfID before acting. If an action exceeds scope,
            it fails closed — the agent stops before it can proceed.
          </p>
          <div className="hero__badges" aria-label="Product capabilities">
            {badges.map((badge) => <span key={badge}>{badge}</span>)}
          </div>
          <div className="hero__actions">
            <ButtonLink variant="primary" href="/sandbox">Try the sandbox</ButtonLink>
            <ButtonLink href="/signup">Start building</ButtonLink>
          </div>
        </div>
        <div className="hero__visual" aria-hidden="true">
          <div className="hero__visual-header">
            <span>POST /api/verify</span>
            <strong>200 OK</strong>
          </div>
          <div className="signal-line"><span>connected agent</span><strong>Ollie</strong></div>
          <div className="signal-line"><span>action</span><strong>purchase</strong></div>
          <div className="signal-line"><span>vendor</span><strong>coachella.com</strong></div>
          <div className="signal-line"><span>amount</span><strong>$742</strong></div>
          <div className="signal-line"><span>active permission</span><strong>browse_web only</strong></div>
          <div className="signal-line signal-line--denied"><span>decision</span><strong>denied</strong></div>
          <div className="hero__event">
            <span>Webhook queued</span>
            <strong>verification.denied</strong>
          </div>
        </div>
      </section>

      <section className="marketing-section solution-matrix" aria-labelledby="solution-heading">
        <div className="solution-matrix__header">
          <div>
            <p className="section-kicker">Operating model</p>
            <h2 id="solution-heading">One permission layer for every agent surface.</h2>
          </div>
          <p>
            Developers route actions through BehalfID. Users create passports for assistants they
            already use. Website owners define how agents access their sites.
          </p>
        </div>

        <div className="system-pipeline" aria-label="BehalfID permission pipeline">
          {["Passport", "Verify", "Enforce", "Audit"].map((step, index) => (
            <div className="system-pipeline__step" key={step}>
              <span>0{index + 1}</span>
              <strong>{step}</strong>
            </div>
          ))}
        </div>

        <div className="solution-matrix__grid">
          {solutionCards.map((card) => (
            <article className={`solution-card solution-card--${card.motif}`} key={card.title}>
              <div className="solution-card__topline">
                <span>{card.label}</span>
              </div>
              <h3>{card.title}</h3>
              <p>{card.body}</p>

              <div className="solution-card__visual" aria-hidden="true">
                {card.motif === "pipeline" ? (
                  <>
                    <div className="solution-node solution-node--source">agent</div>
                    <div className="solution-flow-line" />
                    <div className="solution-node solution-node--accent">verify</div>
                    <div className="solution-flow-line" />
                    <div className="solution-node solution-node--split">
                      <span>allow</span>
                      <span>deny</span>
                    </div>
                  </>
                ) : null}
                {card.motif === "passport" ? (
                  <div className="solution-passport">
                    <div><span>allowed</span><strong>read public pages</strong></div>
                    <div><span>approval</span><strong>purchase under $25</strong></div>
                    <div><span>blocked</span><strong>full account access</strong></div>
                  </div>
                ) : null}
                {card.motif === "routes" ? (
                  <div className="solution-routes">
                    <div><span>/docs</span><strong>allow</strong></div>
                    <div><span>/contact</span><strong>deny form</strong></div>
                    <div><span>/checkout</span><strong>fail closed</strong></div>
                  </div>
                ) : null}
              </div>

              <div className="solution-card__outcome">
                <span>model</span>
                <strong>{card.outcome}</strong>
              </div>

              <div className="solution-card__cta" aria-label={`${card.title} links`}>
                {card.links.map(([label, href]) => (
                  <a key={href} href={href}>{label}</a>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="marketing-section connected-agents-section">
        <p className="section-kicker">Connected agents</p>
        <h2>Works with agents you already use.</h2>
        <p className="section-lede">
          Start with manual passports for existing assistants, then move to API enforcement
          when an app, provider, or automation calls BehalfID before acting.
        </p>
        <div className="connected-agent-grid">
          {connectedAgents.map(([title, body]) => (
            <div key={title}>
              <strong>{title}</strong>
              <p>{body}</p>
            </div>
          ))}
        </div>
        <p className="section-note">
          BehalfID does not control third-party agents directly unless they or your app integrate the verification API.
        </p>
      </section>

      <section className="marketing-section">
        <p className="section-kicker">Problem</p>
        <h2>AI agents are moving from suggestions to actions.</h2>
        <div className="problem-grid">
          <p>
            Purchases, API calls, workflow automation, data access, and delegated user actions
            all need the same answer: is this agent actually allowed to do this?
          </p>
          <p>
            API keys prove an integration can call your system. OAuth proves a user consented
            to broad access. Neither models per-action delegation with resources, scopes,
            expiration, approval requirements, revocation, or transaction limits.
          </p>
        </div>
      </section>

      <section className="marketing-section">
        <p className="section-kicker">Fail-closed enforcement</p>
        <h2>What BehalfID stops.</h2>
        <p className="section-lede">
          Denied actions fail closed — the agent throws before reaching the code that would have
          executed the action. On denial, the safe default is to stop rather than proceed.
        </p>
        <div className="stops-grid">
          {whatBehalfIDStops.map(([title, body]) => (
            <div key={title}>
              <strong>{title}</strong>
              <p>{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="marketing-section">
        <p className="section-kicker">Not just transactions</p>
        <h2>A scope for every action category.</h2>
        <p className="section-lede">
          BehalfID ships with scope templates for common categories. A permission says an agent
          can do an action on a resource under constraints — you define what that means for your agent.
        </p>
        <div className="connected-agent-grid">
          {scopeCategories.map(([title, body]) => (
            <div key={title}>
              <strong>{title}</strong>
              <p>{body}</p>
            </div>
          ))}
        </div>
        <p className="section-note">
          Transactions are one template, not the whole product. The same enforcement pattern applies
          to data access, messaging, scheduling, content creation, and admin workflows.
        </p>
      </section>

      <section className="marketing-section">
        <p className="section-kicker">For website owners</p>
        <h2>Site Guard for protected workflows.</h2>
        <p className="section-lede">
          BehalfID Site Guard is the planned AI access gateway for websites. <code>llms.txt</code>{" "}
          can declare intent; Site Guard enforces rules when installed as middleware, a worker,
          proxy, or gateway before traffic reaches protected routes.
        </p>
        <div className="connected-agent-grid">
          {siteGuardCapabilities.map(([title, body]) => (
            <div key={title}>
              <strong>{title}</strong>
              <p>{body}</p>
            </div>
          ))}
        </div>
        <p className="section-note">
          Honest boundary: Site Guard cannot stop all AI traffic globally unless the website
          installs an enforcement point that calls BehalfID and respects the decision.
        </p>
        <div className="hero__actions section-note--spaced">
          <ButtonLink href="/docs/site-guard">Read Site Guard design</ButtonLink>
        </div>
      </section>

      <section className="native-connected">
        <div>
          <p className="section-kicker">Developer integration mode</p>
          <h2>Enforce permissions in your app.</h2>
          <p>Use this when your app or custom agent can call BehalfID before actions happen. This is the mode where your integration enforces the permission decision.</p>
        </div>
        <div>
          <p className="section-kicker">Manual test mode</p>
          <h2>Try the model with existing agents.</h2>
          <p>Use this for Ollie, ChatGPT, Claude, Zapier, Make, or other external agents. It creates a passport and manual test link, but does not control the provider directly.</p>
        </div>
      </section>

      <section className="flow-grid">
        {flowSteps.map((step, index) => (
          <div key={step.title}>
            <span>{index + 1}</span>
            <strong>{step.title}</strong>
            <p>{step.body}</p>
          </div>
        ))}
      </section>

      <section className="use-case">
        <div>
          <p className="section-kicker">Example</p>
          <h2>A transaction permission is just one template.</h2>
          <p>For a purchase-like action, allow only coachella.com, up to $800, expiring after two hours.</p>
          <dl className="constraint-list">
            <div><dt>vendor</dt><dd>coachella.com</dd></div>
            <div><dt>maxAmount</dt><dd>800</dd></div>
            <div><dt>action</dt><dd>purchase</dd></div>
            <div><dt>expiresAt</dt><dd>2 hours</dd></div>
          </dl>
        </div>
        <CodeBlock label="verify response">{`{
  "requestId": "req_xxx",
  "allowed": true,
  "reason": "Action allowed by active permission.",
  "risk": "low"
}`}</CodeBlock>
      </section>

      <section className="developer-section">
        <div>
          <p className="section-kicker">SDK</p>
          <h2>One call before the agent acts.</h2>
          <CodeBlock label="install">{`npm install @behalfid/sdk`}</CodeBlock>
        </div>
        <CodeBlock label="verify.ts">{`import { BehalfID } from "@behalfid/sdk";

const behalf = new BehalfID({
  apiKey: process.env.BEHALFID_API_KEY!,
  baseUrl: "https://behalfid.com"
});

const result = await behalf.verify({
  agentId: "agent_xxx",
  action: "access_data",
  vendor: "gmail.com"
});`}</CodeBlock>
      </section>

      <section className="feature-grid">
        {features.map((feature) => (
          <div key={feature}>
            <strong>{feature}</strong>
            <p>{featureCopy(feature)}</p>
          </div>
        ))}
      </section>

      <section className="marketing-section">
        <p className="section-kicker">FAQ</p>
        <h2>Questions agents and developers ask.</h2>
        <div className="faq-grid">
          {faqs.map((faq) => (
            <section key={faq.question}>
              <h3>{faq.question}</h3>
              <p>{faq.answer}</p>
            </section>
          ))}
        </div>
      </section>

      <section className="final-cta">
        <h2>Start verifying agent actions.</h2>
        <div className="hero__actions">
          <ButtonLink variant="primary" href="/sandbox">Try the sandbox</ButtonLink>
          <ButtonLink href="/signup">Create account</ButtonLink>
          <ButtonLink href="/docs/quickstart">Read integration guide</ButtonLink>
        </div>
        <p className="section-note section-note--spaced">
          Concerned about how secrets and tokens are handled?{" "}
          <a href="/security">Read the security and trust page.</a>
        </p>
      </section>
    </main>
  );
}

function featureCopy(feature: string) {
  const copy: Record<string, string> = {
    "Fail-closed enforcement": "Denied actions throw before reaching the code that would execute them. On denial, the agent stops.",
    "Scoped permissions": "Action rules with resources, allowed actions, blocked actions, expiration, and amount limits.",
    "Audit logs": "Every verification decision is recorded with reason, risk, and request ID.",
    "Signed webhooks": "External systems receive HMAC-signed verification and lifecycle events.",
    "Durable outbox": "Webhook events are queued before delivery so failures are visible.",
    "Dead-letter queue": "Failed events move to a dead-letter state after bounded retries.",
    "JavaScript SDK": "Install from npm and verify actions with one TypeScript-friendly client.",
    "Developer dashboard": "Manage agents, permissions, webhooks, logs, and delivery status."
  };
  return copy[feature] ?? "";
}
