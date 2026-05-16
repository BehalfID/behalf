import Link from "next/link";
import { DocsShell } from "../content";

export default function ConceptsPage() {
  const concepts = [
    ["Permission passports", "A permission passport is the BehalfID record that ties an agent, its credential, permission rules, audit logs, and webhook events together."],
    ["Passport presets", "Ready-made permission bundles for common agent roles: email reader, scheduling assistant, research assistant, shopping assistant, content creator, and CRM assistant. Each preset populates the agent description, provider, and a set of permission scopes that you can review and edit before saving. Presets are available in the agent creation flow and use the same scope templates as manual permissions."],
    ["Manual test mode", "Use this for existing agents when the provider has not integrated BehalfID. Users can test actions through a passport link and copy instructions into the agent, but BehalfID does not automatically control the external provider."],
    ["Developer integration mode", "Use this when your app or custom agent can call the BehalfID API or SDK before actions happen. This is the enforcement path."],
    ["Native agents", "Agents created directly in BehalfID for custom SDK, API, LangChain, OpenAI, or internal company integrations."],
    ["Connected agents", "Manual representations of external agents people already use, such as Ollie, ChatGPT agents, Claude agents, Zapier, Make, or other assistants."],
    ["Providers", "Provider metadata explains where the agent lives. It is descriptive only today and does not authenticate a provider account."],
    ["External reference", "Optional metadata that helps teams map BehalfID records back to an external assistant without collecting provider credentials."],
    ["Manual connection model", "Connected agents do not call provider APIs yet. Your app uses the BehalfID credential to verify actions on behalf of that external agent."],
    ["Public passport links", "Tokenized links expose the agent's allowed permission scopes and let users manually test whether an action would be allowed. They do not expose API keys, logs, developer email, or permission editing. A passport token is not an API key — it only allows viewing the scoped passport and running manual preview checks for one agent. Passport links use a #token=… URL fragment, which keeps the token out of server logs and referrer headers. However, many AI agents (Gemini memory, ChatGPT system prompts, Claude project instructions) do not execute JavaScript or send authorization headers, so they cannot retrieve the scoped data from the link. For these agents, paste the Agent memory block from the passport page instead."],
    ["Agent memory block", "A plain-English copy of the active permission scopes, formatted for pasting into an AI assistant's memory field, system prompt, or custom instructions. Best-effort: some assistants compress or ignore saved memory and may not preserve exact scopes. Use when the agent cannot fetch the passport link."],
    ["Per-task permission prompt", "A copyable block that includes the full BehalfID scope list, a blocked-actions section, and a task placeholder with three structured questions the agent must answer before proceeding. Paste it directly into the active chat where the agent is about to act. More reliable than memory because it is in the active context window, not stored state. Developer integration remains the only automatic enforcement path."],
    ["Enforcement limitations", "Manual mode helps users test and communicate constraints. Automatic enforcement requires the external provider or your app to integrate the verification API."],
    ["Passport token safety", "Passport links intentionally expose allowed permission scopes so external agents can read what they are permitted to do. They never expose API keys, webhook secrets, developer identity, internal IDs, or audit logs. Treat the passport link like a secret — anyone with the token can view the scoped passport."],
    ["Permissions", "Rules that say an agent can do an action on a resource under constraints. Each permission can include an explicit list of allowed actions, blocked actions, a requires-approval flag, and expiration. Examples include access_data on gmail.com (allowed: read labels, blocked: send email), schedule on google-calendar (allowed: suggest times, blocked: delete events), or purchase on coachella.com (max $800). Agent descriptions are informational; permissions are the source of truth for what an agent may do."],
    ["Fail-closed enforcement", "When BehalfID denies an action, enforceAction throws — the caller never reaches the code that would have executed the action. This is fail closed: on denial, the safe default is to stop rather than proceed. The opposite would be fail open (proceeding if the check fails or is unavailable). BehalfID's enforcement pattern is always fail closed."],
    ["MCP enforcement", "The behalf CLI ships a Model Context Protocol server that exposes a verify_action tool. When an AI tool (Claude Code, Codex, Cursor) connects to the MCP server, it can call verify_action before executing any external action. behalf mcp init writes .mcp.json and .behalf/context.md to the project directory; behalf claude and behalf codex fetch the latest permissions and launch the tool with the server already wired in."],
    ["Site Guard", "A planned website-owner enforcement pattern for AI access rules. llms.txt-style files can declare intent; Site Guard should enforce rules only when installed as middleware, proxy, worker, or gateway that calls BehalfID before protected routes execute."],
    ["Scope templates", "Reusable permission patterns organized by category: data access, communication, scheduling, commerce, content, and admin. Each template provides a default action, allowed actions, blocked actions, and a requires-approval flag that you can edit before saving. Examples: read_email (access_data on gmail.com), browse_web, schedule_meeting, purchase."],
    ["Verification", "A pre-action decision that returns allowed, reason, risk, and requestId before the agent proceeds."],
    ["Audit logs", "Records of authenticated verification decisions for debugging, compliance, and support workflows."],
    ["MVP enforcement", "BehalfID currently enforces action, expiration, revoked status, and simple resource or amount constraints. Advanced semantic constraints require the integrating app to pass relevant context and respect BehalfID's decision."],
    ["Future integrations", "Provider-native integrations are planned, but the current model keeps the MVP focused on permission passports and verification."]
  ];

  return (
    <DocsShell
      title="Concepts"
      description="The core nouns behind BehalfID's connected-agent permission passport model."
      previous={{ href: "/docs/site-guard", label: "Site Guard" }}
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
      <section className="docs-anchor-section">
        <h2>Security model</h2>
        <p>
          For a full explanation of how BehalfID handles secrets, enforcement, audit logs, and
          current limitations, see the <Link href="/security">Security and trust</Link> page.
        </p>
      </section>
    </DocsShell>
  );
}
