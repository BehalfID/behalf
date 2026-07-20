import Link from "next/link";
import type { Metadata } from "next";
import { DocsShell } from "../content";

export const metadata: Metadata = {
  title: "Concepts — BehalfID",
  description: "Understand permission passports, fail-closed enforcement, approval-required flows, audit logs, MCP enforcement, and Managed Profiles.",
  alternates: { canonical: "/docs/concepts" }
};

export default function ConceptsPage() {
  const concepts = [
    ["Permission passports", "A permission passport is the BehalfID record that ties an agent, its credential, permission rules, audit logs, and webhook events together."],
    ["Passport presets", "Ready-made permission bundles for common agent roles: email reader, scheduling assistant, research assistant, shopping assistant, content creator, and CRM assistant. Each preset populates the agent description, provider, and a set of permission scopes that you can review and edit before saving. Presets are available in the agent creation flow and use the same scope templates as manual permissions."],
    ["Manual test mode", "Use this for existing agents when the provider has not integrated BehalfID. Users can test actions through a passport link and copy instructions into the agent, but BehalfID does not automatically control the external provider."],
    ["Developer integration mode", "Use this when your app or custom agent can call the BehalfID API or SDK before actions happen. This is the enforcement path."],
    ["Agents", "An agent is any AI system, workflow, or coding tool (Claude Code, Codex, Cursor, a custom LangChain/OpenAI agent, etc.) that BehalfID identifies before it tries to act. Every agent has a stable agentId and an API key used to authenticate verify() calls."],
    ["SDK integration (enforcement path)", "When your app calls behalf.verify() before a tool runs, BehalfID is in the enforcement path. Allowed actions proceed; denied or approval-required actions are blocked before the tool executes. This is the only fully automatic enforcement path."],
    ["Manual passport mode", "For existing AI assistants (ChatGPT, Claude.ai, Gemini) that you cannot modify, BehalfID generates a passport link with the agent's allowed scopes. Paste the instructions into the assistant's memory. This is best-effort: enforcement depends on the assistant's compliance, not a code-level check."],
    ["Providers", "Provider metadata explains which AI platform or framework the agent runs on. It is descriptive metadata only — it does not authenticate a provider account."],
    ["External reference", "Optional metadata that helps teams map BehalfID agent records back to an external assistant without collecting provider credentials."],
    ["Public passport links", "Tokenized links expose the agent's allowed permission scopes and let users manually test whether an action would be allowed. They do not expose API keys, logs, developer email, or permission editing. A passport token is not an API key — it only allows viewing the scoped passport and running manual preview checks for one agent. Passport links use a #token=… URL fragment, which keeps the token out of server logs and referrer headers. However, many AI agents (Gemini memory, ChatGPT system prompts, Claude project instructions) do not execute JavaScript or send authorization headers, so they cannot retrieve the scoped data from the link. For these agents, paste the Agent memory block from the passport page instead."],
    ["Agent memory block", "A plain-English copy of the active permission scopes, formatted for pasting into an AI assistant's memory field, system prompt, or custom instructions. Best-effort: some assistants compress or ignore saved memory and may not preserve exact scopes. Use when the agent cannot fetch the passport link."],
    ["Per-task permission prompt", "A copyable block that includes the full BehalfID scope list, a blocked-actions section, and a task placeholder with three structured questions the agent must answer before proceeding. Paste it directly into the active chat where the agent is about to act. More reliable than memory because it is in the active context window, not stored state. Developer integration remains the only automatic enforcement path."],
    ["Enforcement limitations", "Manual mode helps users test and communicate constraints. Automatic enforcement requires the external provider or your app to integrate the verification API."],
    ["Passport token safety", "Passport links intentionally expose allowed permission scopes so external agents can read what they are permitted to do. They never expose API keys, webhook secrets, developer identity, internal IDs, or audit logs. Treat the passport link like a secret — anyone with the token can view the scoped passport."],
    ["Permissions", "Rules that say an agent can do an action on a resource under constraints. Each permission can include explicit allowed actions, blocked actions, a requires-approval flag, amount or vendor constraints, and expiration. Examples include browse_web on web (allowed: read public pages, blocked: checkout), access_data on gmail.com (allowed: read labels, blocked: send email), or purchase on amazon.com (max $25). Agent descriptions are informational; permissions are the source of truth for what an agent may do."],
    ["Permission matching", "Blocked actions override allows across active permissions for the same agent. A non-empty allowedActions list narrows a permission to those exact action strings, so verifying a broad parent action does not bypass the narrowed list. Resource and vendor matching supports exact values and comma-separated values when stored that way. Missing vendor, resource, or amount values do not bypass constraints."],
    ["Fail-closed enforcement", "When BehalfID denies an action, the executor should throw or return before running the tool. This is fail closed: verify first, execute second, and stop on denial, approval-required decisions, unavailable checks, or missing constrained inputs. The opposite would be fail open, where the tool proceeds when a check fails."],
    ["Deploy approvals", "A common first workflow: an AI coding agent (Claude Code, Codex, Cursor) has two permissions — deploy on vercel.com (requiresApproval: false, staging only) and deploy_production on vercel.com (requiresApproval: true). When the agent attempts a production deploy, verify_action returns allowed: false with reason 'Permission requires approval before execution.' The agent pauses and surfaces the requestId. After you approve in the dashboard, the agent retries and the action is allowed."],
    ["MCP enforcement", "The behalf CLI ships a Model Context Protocol server that exposes a verify_action tool. When an AI tool (Claude Code, Codex, Cursor) connects to the MCP server, it calls verify_action before executing any risky or external action. behalf mcp init writes .mcp.json and .behalf/context.md to the project directory; behalf claude and behalf codex fetch the latest permissions and launch the tool with the server already wired in. Denial means do not execute; approval-required means pause for human sign-off."],
    ["Google SSO", "Developer accounts can sign in with Google (OIDC). Workspaces on Pro and higher can allowlist company email domains and optionally enforce Google sign-in for those domains. Invites are still required to join a workspace. SAML and non-Google IdPs are not supported yet."],
    ["Managed Profiles", "Managed Profiles let teams put coding-agent CLIs behind a workspace policy checkpoint. Install local shims for tools like claude, codex, and cursor; resolve policy before the real tool starts; and record safe activity for review. Modes are unmanaged, managed, or required — required fails closed when policy cannot be verified. Protected repos are identified by policy repo hash, not raw git remotes or local paths. Required-mode pause requests can require dashboard approval before enforcement is paused."],
    ["Site Guard", "A planned website-owner enforcement pattern for AI access rules. llms.txt-style files can declare intent; Site Guard should enforce rules only when installed as middleware, proxy, worker, or gateway that calls BehalfID before protected routes execute."],
    ["Scope templates", "Reusable permission patterns organized by category: data access, communication, scheduling, commerce, content, and admin. Each template provides a default action, allowed actions, blocked actions, and a requires-approval flag that you can edit before saving. Examples: read_email (access_data on gmail.com), browse_web, schedule_meeting, purchase."],
    ["Verification", "A pre-action decision that returns allowed, reason, risk, and requestId before the agent proceeds."],
    ["Audit logs", "Records of authenticated verification decisions for debugging, compliance, and support workflows."],
    ["MVP enforcement", "BehalfID enforces action matching, blockedActions overrides, allowedActions narrowing, approval requirements, expiration, revoked status, and simple resource/vendor/amount constraints. Advanced semantic constraints still require the integrating app to pass relevant context and respect BehalfID's decision."],
    ["Future integrations", "Provider-native integrations are planned, but the current model keeps the MVP focused on permission passports and verification."]
  ];

  return (
    <DocsShell
      title="Concepts"
      description="The core nouns behind BehalfID's runtime action authorization model — agents, permissions, fail-closed enforcement, approval gates, and audit logs."
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
