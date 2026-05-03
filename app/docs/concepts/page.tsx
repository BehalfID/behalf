import { DocsShell } from "../content";

export default function ConceptsPage() {
  const concepts = [
    ["Agents", "Software actors with a BehalfID identity and API key. Agents are the unit that asks to perform an action."],
    ["Permissions", "Rules that scope actions by amount, vendor, expiration, and status. Revoking the latest matching permission denies future verification."],
    ["Verification", "A pre-action decision that returns allowed, reason, risk, and requestId before the agent proceeds."],
    ["Delegation", "The user-approved boundary that says what an agent may do on someone’s behalf."],
    ["Audit logs", "Records of authenticated verification decisions for debugging, compliance, and support workflows."],
    ["Webhooks", "Signed events for downstream systems, durable retries, dead-letter handling, and replay."]
  ];

  return (
    <DocsShell
      title="Concepts"
      description="The core nouns behind BehalfID’s agent authorization model."
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
