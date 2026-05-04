import { DocsShell } from "../content";

export default function ConceptsPage() {
  const concepts = [
    ["Permission passports", "A permission passport is the BehalfID record that ties an agent, its credential, permission rules, audit logs, and webhook events together."],
    ["Manual test mode", "Use this for existing agents when the provider has not integrated BehalfID. Users can test actions through a passport link and copy instructions into the agent, but BehalfID does not automatically control the external provider."],
    ["Developer integration mode", "Use this when your app or custom agent can call the BehalfID API or SDK before actions happen. This is the enforcement path."],
    ["Native agents", "Agents created directly in BehalfID for custom SDK, API, LangChain, OpenAI, or internal company integrations."],
    ["Connected agents", "Manual representations of external agents people already use, such as Ollie, ChatGPT agents, Claude agents, Zapier, Make, or other assistants."],
    ["Providers", "Provider metadata explains where the agent lives. It is descriptive only today and does not authenticate a provider account."],
    ["External reference", "Optional metadata that helps teams map BehalfID records back to an external assistant without collecting provider credentials."],
    ["Manual connection model", "Connected agents do not call provider APIs yet. Your app uses the BehalfID credential to verify actions on behalf of that external agent."],
    ["Public passport links", "Tokenized links let users manually test whether an action would be allowed. They do not expose API keys, logs, developer email, or permission editing."],
    ["Enforcement limitations", "Manual mode helps users test and communicate constraints. Automatic enforcement requires the external provider or your app to integrate the verification API."],
    ["Permissions", "Rules that scope actions by amount, vendor, expiration, and status. Revoking the latest matching permission denies future verification."],
    ["Verification", "A pre-action decision that returns allowed, reason, risk, and requestId before the agent proceeds."],
    ["Audit logs", "Records of authenticated verification decisions for debugging, compliance, and support workflows."],
    ["Future integrations", "Provider-native integrations are planned, but the current model keeps the MVP focused on permission passports and verification."]
  ];

  return (
    <DocsShell
      title="Concepts"
      description="The core nouns behind BehalfID’s connected-agent permission passport model."
      previous={{ href: "/docs/webhooks", label: "Webhooks" }}
    >
      <div className="concept-grid">
        {concepts.map(([title, body]) => (
          <section key={title}>
            <h2>{title}</h2>
            <p>{body}</p>
          </section>
        ))}
      </div>
      <section className="docs-anchor-section" id="external-reference">
        <h2>External reference</h2>
        <p>
          For connected agents, the external reference is optional. Use it only to help identify
          the agent outside BehalfID.
        </p>
        <ul className="docs-list">
          <li><code>Jasper&apos;s Ollie assistant</code></li>
          <li><code>ChatGPT project: Sales ops</code></li>
          <li><code>Zapier automation: invoice follow-up</code></li>
          <li><code>Internal agent URL</code></li>
          <li>Leave it blank if you do not have one.</li>
        </ul>
        <p>
          BehalfID does not use this value as authentication. It is metadata only.
        </p>
      </section>
    </DocsShell>
  );
}
