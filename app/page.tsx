import Link from "next/link";
import Image from "next/image";

const features = [
  "Scoped permissions",
  "Verification API",
  "Audit logs",
  "Signed webhooks",
  "Durable delivery",
  "Dead-letter queue and replay",
  "JavaScript SDK",
  "Developer portal"
];

export default function Home() {
  return (
    <main className="marketing">
      <nav className="marketing-nav">
        <Link className="site-logo" href="/">
          <span className="site-logo__mark">
            <Image alt="" height={22} src="/behalf_symbols.png" width={22} />
          </span>
          <span>BehalfID</span>
        </Link>
        <div>
          <Link href="/docs">Docs</Link>
          <Link href="/login">Log in</Link>
          <Link className="nav-cta" href="/signup">Start building</Link>
        </div>
      </nav>

      <section className="hero">
        <div className="hero__content">
          <p className="section-kicker">Agent permission infrastructure</p>
          <h1>Identity and permissions for AI agents.</h1>
          <p>
            BehalfID lets developers verify whether an AI agent is allowed to act
            before the action happens.
          </p>
          <div className="hero__actions">
            <Link className="primary-button" href="/signup">Start building</Link>
            <Link className="secondary-button" href="/docs">View docs</Link>
          </div>
        </div>
        <div className="hero__visual" aria-hidden="true">
          <div className="signal-line"><span>verify.purchase</span><strong>allowed</strong></div>
          <div className="signal-line"><span>vendor</span><strong>coachella.com</strong></div>
          <div className="signal-line"><span>maxAmount</span><strong>$800</strong></div>
          <div className="signal-line signal-line--deny"><span>risk</span><strong>low</strong></div>
        </div>
      </section>

      <section className="marketing-section">
        <p className="section-kicker">Problem</p>
        <h2>AI agents are moving from suggestions to actions.</h2>
        <p>
          Purchases, API calls, workflow automation, data access, and delegated user actions
          all need the same answer: is this agent actually allowed to do this?
        </p>
      </section>

      <section className="flow-grid">
        {["Create an agent", "Define permissions", "Verify actions", "Audit and receive events"].map((step, index) => (
          <div key={step}>
            <span>{index + 1}</span>
            <strong>{step}</strong>
          </div>
        ))}
      </section>

      <section className="use-case">
        <div>
          <p className="section-kicker">Example</p>
          <h2>An agent tries to buy event tickets.</h2>
          <p>Allow only purchase actions at coachella.com, up to $800, expiring after two hours.</p>
        </div>
        <pre>{`{
  "allowed": true,
  "reason": "Action allowed by active permission.",
  "risk": "low"
}`}</pre>
      </section>

      <section className="developer-section">
        <div>
          <p className="section-kicker">SDK</p>
          <h2>One call before the agent acts.</h2>
        </div>
        <pre>{`import { BehalfID } from "@behalfid/sdk";

const behalf = new BehalfID({
  apiKey: process.env.BEHALFID_API_KEY!,
  baseUrl: "https://behalfid.vercel.app"
});

const result = await behalf.verify({
  agentId: "agent_xxx",
  action: "purchase",
  amount: 742,
  vendor: "coachella.com"
});`}</pre>
      </section>

      <section className="feature-grid">
        {features.map((feature) => <div key={feature}>{feature}</div>)}
      </section>

      <section className="final-cta">
        <h2>Start verifying agent actions.</h2>
        <div className="hero__actions">
          <Link className="primary-button" href="/signup">Create account</Link>
          <Link className="secondary-button" href="/docs/quickstart">Read integration guide</Link>
        </div>
      </section>
    </main>
  );
}
