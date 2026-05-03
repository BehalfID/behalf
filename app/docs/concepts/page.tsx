import { DocsShell } from "../content";

export default function ConceptsPage() {
  const concepts = [
    ["Permission passports", "A permission passport is the BehalfID record that ties an agent, its credential, permission rules, audit logs, and webhook events together."],
    ["Native agents", "Agents created directly in BehalfID for custom SDK, API, LangChain, OpenAI, or internal company integrations."],
    ["Connected agents", "Manual representations of external agents people already use, such as Ollie, ChatGPT agents, Claude agents, Zapier, Make, or other assistants."],
    ["Providers", "Provider metadata explains where the agent lives. It is descriptive only today and does not authenticate a provider account."],
    ["External identifiers", "Optional labels or handles help teams map BehalfID records back to an external assistant without collecting provider credentials."],
    ["Manual connection model", "Connected agents do not call provider APIs yet. Your app uses the BehalfID credential to verify actions on behalf of that external agent."],
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
    </DocsShell>
  );
}
