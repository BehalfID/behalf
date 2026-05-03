import { PublicNav } from "@/components/layout/PublicNav";
import { ButtonLink, CodeBlock } from "@/components/ui";

const badges = ["Connected agents", "SDK on npm", "Signed webhooks", "Permission passports"];

const features = [
  "Scoped permissions",
  "Audit logs",
  "Signed webhooks",
  "Durable outbox",
  "Dead-letter queue",
  "Replay",
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
    body: "Scope actions by vendor, amount, expiration, and active or revoked status."
  },
  {
    title: "Verify action",
    body: "Call BehalfID before the agent spends money, calls APIs, or accesses data."
  },
  {
    title: "Audit + webhook event",
    body: "Record the decision and deliver signed events through the durable outbox."
  }
];

const connectedAgents = [
  ["Ollie", "Represent a personal assistant and scope purchase or planning actions."],
  ["ChatGPT agent", "Attach a permission passport to a ChatGPT-powered workflow."],
  ["Claude agent", "Verify sensitive data access before a Claude agent proceeds."],
  ["Zapier / Make", "Wrap automations in action-level constraints and audit trails."],
  ["Custom agents", "Use native BehalfID agents for LangChain, OpenAI, or internal systems."]
];

export default function Home() {
  return (
    <main className="marketing">
      <PublicNav />

      <section className="hero">
        <div className="hero__content">
          <p className="section-kicker">Agent permission infrastructure</p>
          <h1>Permission passports for AI agents.</h1>
          <p>
            Connect the agents you already use, define what they’re allowed to do,
            and verify actions before they happen.
          </p>
          <div className="hero__badges" aria-label="Product capabilities">
            {badges.map((badge) => <span key={badge}>{badge}</span>)}
          </div>
          <div className="hero__actions">
            <ButtonLink variant="primary" href="/signup">Start building</ButtonLink>
            <ButtonLink href="/docs">View docs</ButtonLink>
          </div>
        </div>
        <div className="hero__visual" aria-hidden="true">
          <div className="hero__visual-header">
            <span>POST /api/verify</span>
            <strong>200 OK</strong>
          </div>
          <div className="signal-line"><span>connected agent</span><strong>Ollie</strong></div>
          <div className="signal-line"><span>provider</span><strong>ollie</strong></div>
          <div className="signal-line"><span>action</span><strong>purchase</strong></div>
          <div className="signal-line"><span>vendor</span><strong>coachella.com</strong></div>
          <div className="signal-line"><span>amount</span><strong>$742 / $800</strong></div>
          <div className="signal-line signal-line--result"><span>decision</span><strong>allowed</strong></div>
          <div className="hero__event">
            <span>Webhook queued</span>
            <strong>verification.allowed</strong>
          </div>
        </div>
      </section>

      <section className="marketing-section connected-agents-section">
        <p className="section-kicker">Connected agents</p>
        <h2>Connect your existing agents.</h2>
        <p className="section-lede">
          BehalfID can manually represent the agents people and teams already use today.
          Provider-native integrations are not required for the permission passport model.
        </p>
        <div className="connected-agent-grid">
          {connectedAgents.map(([title, body]) => (
            <div key={title}>
              <strong>{title}</strong>
              <p>{body}</p>
            </div>
          ))}
        </div>
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
            to broad access. Neither models per-action delegation with constraints like amount,
            vendor, expiration, and revocation.
          </p>
        </div>
      </section>

      <section className="native-connected">
        <div>
          <p className="section-kicker">Native</p>
          <h2>Native agents are created for your app.</h2>
          <p>Use native agents when you are building a custom SDK, API, LangChain, OpenAI, or internal integration and want BehalfID-issued credentials from the start.</p>
        </div>
        <div>
          <p className="section-kicker">Connected</p>
          <h2>Connected agents represent tools already in use.</h2>
          <p>Use connected agents for Ollie, ChatGPT, Claude, Zapier, Make, or other external agents. They are manually represented today, with provider-native integrations planned.</p>
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
          <h2>An agent tries to buy event tickets.</h2>
          <p>Allow only purchase actions at coachella.com, up to $800, expiring after two hours.</p>
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
  baseUrl: "https://behalfid.vercel.app"
});

const result = await behalf.verify({
  agentId: "agent_xxx",
  action: "purchase",
  amount: 742,
  vendor: "coachella.com"
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

      <section className="final-cta">
        <h2>Start verifying agent actions.</h2>
        <div className="hero__actions">
          <ButtonLink variant="primary" href="/signup">Create account</ButtonLink>
          <ButtonLink href="/docs/quickstart">Read integration guide</ButtonLink>
        </div>
      </section>
    </main>
  );
}

function featureCopy(feature: string) {
  const copy: Record<string, string> = {
    "Scoped permissions": "Action rules with amount, vendor, expiration, and revoke controls.",
    "Audit logs": "Every verification decision is recorded with reason, risk, and request ID.",
    "Signed webhooks": "External systems receive HMAC-signed verification and lifecycle events.",
    "Durable outbox": "Webhook events are queued before delivery so failures are visible.",
    "Dead-letter queue": "Failed events move to a dead-letter state after bounded retries.",
    Replay: "Developers can replay dead-lettered events after fixing receivers.",
    "JavaScript SDK": "Install from npm and verify actions with one TypeScript-friendly client.",
    "Developer dashboard": "Manage agents, permissions, webhooks, logs, and delivery status."
  };
  return copy[feature] ?? "";
}
