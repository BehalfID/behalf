import { CodeBlock } from "@/components/ui";

export type PostMeta = {
  slug: string;
  title: string;
  date: string;
  dateLabel: string;
  readingTime: string;
  excerpt: string;
  tags: string[];
};

export type Post = PostMeta & {
  content: React.ReactNode;
};

export const posts: Post[] = [
  {
    slug: "the-decision-packet",
    title: "The decision packet: BehalfID's verification primitive",
    date: "2026-05-06",
    dateLabel: "May 6, 2026",
    readingTime: "6 min read",
    excerpt:
      "Every verify call produces a decision packet — a structured answer to one question: is this specific action allowed right now? Here's what happens between the request and the response.",
    tags: ["architecture", "api"],
    content: (
      <>
        <p>
          Every verify call in BehalfID produces a decision packet. It&apos;s a
          structured answer to one question: is this specific action allowed right
          now, for this agent, against this resource?
        </p>
        <p>
          The packet is not a policy engine output or a capability token. It&apos;s a
          single decision record — immutable once produced, logged on both sides,
          and the one artifact your enforcement code should branch on.
        </p>

        <div className="blog-section-label">
          <span>01</span>
          <h2>The action request</h2>
        </div>
        <p>
          The request side of the packet is what your integration sends to{" "}
          <code>POST /api/verify</code> or through the SDK:
        </p>
        <CodeBlock label="verify call">{`const decision = await behalf.verify({
  agentId: "agent_ollie",
  action: "purchase",
  vendor: "coachella.com",
  amount: 742
});`}</CodeBlock>
        <p>
          <code>agentId</code> identifies the agent making the request.{" "}
          <code>action</code> is the operation being attempted. <code>vendor</code>{" "}
          and <code>amount</code> are optional but recorded in the audit log when
          provided. The request is authenticated by the agent&apos;s API key, so the
          first thing BehalfID does is verify the caller.
        </p>

        <div className="blog-section-label">
          <span>02</span>
          <h2>What BehalfID checks</h2>
        </div>
        <p>
          Given an authenticated request, BehalfID evaluates the agent&apos;s active
          passport against the requested action in order:
        </p>
        <ul className="blog-prose__list">
          <li>
            <strong>Agent state.</strong> If the agent is disabled, all verify
            calls return <code>denied</code> immediately.
          </li>
          <li>
            <strong>Passport lookup.</strong> BehalfID queries active, non-expired
            permissions scoped to this agent.
          </li>
          <li>
            <strong>Scope match.</strong> The requested action is compared against
            allowed actions in each matching scope. If no scope covers the action,
            the decision is <code>denied</code>.
          </li>
          <li>
            <strong>Block list check.</strong> If the action appears in a
            scope&apos;s blocked actions, the decision is <code>denied</code> even if
            the action is otherwise in the allowed set.
          </li>
          <li>
            <strong>Requires-approval flag.</strong> If the matching scope is
            marked <code>requiresApproval</code>, the decision is{" "}
            <code>requires_approval</code>. The action should pause for human
            review.
          </li>
          <li>
            <strong>Expiration.</strong> Permissions expire by date. Expired
            permissions are not matched.
          </li>
          <li>
            <strong>Revocation.</strong> Revoked permissions are excluded from the
            lookup entirely.
          </li>
        </ul>

        <div className="blog-section-label">
          <span>03</span>
          <h2>The decision record</h2>
        </div>
        <p>
          The verify response carries everything your enforcement code needs:
        </p>
        <CodeBlock label="decision response">{`{
  allowed: false,
  decision: "denied",
  reason: "No active purchase permission",
  requestId: "req_01hvz8…",
  agentId: "agent_ollie",
  riskLevel: "medium"
}`}</CodeBlock>
        <p>
          <code>allowed</code> is the boolean your enforcement code gates on.{" "}
          <code>decision</code> is the semantic outcome —{" "}
          <code>allowed</code>, <code>denied</code>, or{" "}
          <code>requires_approval</code>. <code>reason</code> is the
          human-readable explanation. <code>requestId</code> links the response to
          its audit log entry.
        </p>
        <div className="blog-note">
          <code>requestId</code> is stable and unique per verify call. Store it
          alongside your own request identifiers so you can correlate your logs
          with BehalfID&apos;s audit trail.
        </div>

        <div className="blog-section-label">
          <span>04</span>
          <h2>Audit events</h2>
        </div>
        <p>
          Every authenticated verify call is written to the audit log before the
          response is returned. The entry captures the decision, reason, risk
          level, action, vendor, and amount alongside the agent and request
          identifiers.
        </p>
        <p>
          Log entries are scoped: agent API keys read only their own history.
          Dashboard users see only logs belonging to their own agents. Manual
          passport previews do not produce log entries — only real{" "}
          <code>POST /api/verify</code> calls do.
        </p>
        <p>
          Webhook subscribers receive a <code>verification.allowed</code>,{" "}
          <code>verification.denied</code>, or{" "}
          <code>verification.requires_approval</code> event for each decision,
          delivered through an outbox-backed retry system with dead-letter replay
          available from the console.
        </p>

        <div className="blog-section-label">
          <span>05</span>
          <h2>What to do with the decision</h2>
        </div>
        <p>
          The enforcement pattern is identical regardless of what the decision
          contains: branch on <code>decision.allowed</code> before your executor
          runs.
        </p>
        <CodeBlock label="enforcement pattern">{`const decision = await behalf.verify({ agentId, action, vendor, amount });

if (!decision.allowed) {
  throw new Error(\`BehalfID blocked: \${decision.reason}\`);
}

// Executor only reaches this point when decision.allowed === true.
await executor.run(action, { vendor, amount });`}</CodeBlock>
        <p>
          If BehalfID is unreachable, your code should treat the outcome as denied
          and not proceed. Availability gaps should not become permission grants.
        </p>
      </>
    )
  },

  {
    slug: "fail-closed-agent-enforcement",
    title: "Fail closed: the only safe default for agent enforcement",
    date: "2026-04-29",
    dateLabel: "Apr 29, 2026",
    readingTime: "4 min read",
    excerpt:
      "When an agent doesn't have permission, two things can happen: it stops, or it doesn't. One of those is safe. The gap between availability and enforcement is where most agent incidents happen.",
    tags: ["enforcement", "security"],
    content: (
      <>
        <p>
          When a permission check fails or is unavailable, your integration has to
          decide what to do. The options are: stop the agent, or let it proceed
          anyway.
        </p>
        <p>
          The second option is called fail open. It is never the right default for
          an agent acting on behalf of a user.
        </p>

        <div className="blog-section-label">
          <span>01</span>
          <h2>What fail closed means</h2>
        </div>
        <p>
          Fail closed means the agent throws on denial and the code path that
          would execute the action never runs. The action does not happen. The user
          is notified. The decision is logged.
        </p>
        <CodeBlock label="fail-closed pattern">{`const result = await behalf.verify({
  agentId,
  action: "purchase",
  vendor: "coachella.com",
  amount: 742
});

if (!result.allowed) {
  throw new Error(\`Blocked: \${result.reason}\`);
}

// Only reachable after explicit allow.
await charge(vendor, amount);`}</CodeBlock>
        <p>
          The executor — the charge call, the file write, the API call to an
          external service — is only reachable after an explicit{" "}
          <code>allowed: true</code> response. There is no fallback path that
          skips the check.
        </p>

        <div className="blog-section-label">
          <span>02</span>
          <h2>Why fail open is dangerous</h2>
        </div>
        <p>
          Fail open treats a check that doesn&apos;t return <code>denied</code> as
          permission. It looks like this:
        </p>
        <CodeBlock label="fail-open (don't do this)">{`let allowed = false;
try {
  const result = await behalf.verify({ agentId, action, vendor, amount });
  allowed = result.allowed;
} catch {
  // Network error — assume allowed to avoid blocking the user.
  allowed = true;
}

if (allowed) {
  await charge(vendor, amount);
}`}</CodeBlock>
        <p>
          The problem is the catch block. An agent operating at scale will
          encounter network errors, timeouts, cold-start delays, and transient 5xx
          responses. If each of those gaps becomes a silent permission grant, the
          permission system is effectively optional.
        </p>
        <div className="blog-note">
          Availability gaps should not become permission grants. If your
          enforcement layer is unavailable, the correct outcome is a failed action,
          not a silently allowed one.
        </div>

        <div className="blog-section-label">
          <span>03</span>
          <h2>Where the gap actually lives</h2>
        </div>
        <p>
          Most agent incidents don&apos;t happen because the permission system returned
          the wrong answer. They happen because it wasn&apos;t called at all — or its
          answer was ignored.
        </p>
        <ul className="blog-prose__list">
          <li>
            The check is added to the happy path but not to the retry or fallback
            path.
          </li>
          <li>
            The check is called but the result is not awaited before the executor
            runs.
          </li>
          <li>
            The check is bypassed for performance — cached too long, or skipped
            for &quot;low-risk&quot; actions.
          </li>
          <li>
            The check exists, but the executor can also be reached through a
            different entry point that has no check.
          </li>
        </ul>
        <p>
          Each of these is a structural fail-open. The fix is the same: the
          executor must only be reachable after an explicit allow decision.
        </p>

        <div className="blog-section-label">
          <span>04</span>
          <h2>Handling errors correctly</h2>
        </div>
        <p>
          When BehalfID is unreachable, throw with a specific message that signals
          the permission layer was unavailable, not a generic error:
        </p>
        <CodeBlock label="error handling">{`let result;
try {
  result = await behalf.verify({ agentId, action, vendor, amount });
} catch (err) {
  throw new Error(
    \`Permission check unavailable. Action blocked. (\${err.message})\`
  );
}

if (!result.allowed) {
  throw new Error(\`Blocked: \${result.reason}\`);
}

await executor.run(action, { vendor, amount });`}</CodeBlock>
        <p>
          The user sees a clear failure. The agent logs it. The action does not
          happen. That is the correct outcome when the permission layer is
          unavailable.
        </p>
      </>
    )
  },

  {
    slug: "permission-passports-not-api-keys",
    title: "Why AI agents need permission passports, not API keys",
    date: "2026-04-22",
    dateLabel: "Apr 22, 2026",
    readingTime: "5 min read",
    excerpt:
      "API keys tell you who is calling. They don't tell you what that caller is allowed to do in this moment, for this action, against this resource. For autonomous agents, that distinction matters.",
    tags: ["permissions", "architecture"],
    content: (
      <>
        <p>
          An API key is an authentication credential. It answers one question: who
          is calling? It does not answer whether the caller is permitted to take a
          specific action right now.
        </p>
        <p>
          For a human developer making an API call, that&apos;s usually enough. The
          developer has context, can read error messages, and can be held
          accountable. An autonomous agent operating across dozens of services
          without supervision is a different category of caller entirely.
        </p>

        <div className="blog-section-label">
          <span>01</span>
          <h2>What an API key actually proves</h2>
        </div>
        <p>
          An API key proves possession of a credential. If the key is valid, the
          service accepts the request. The key doesn&apos;t carry scope — it doesn&apos;t say
          this caller may purchase but not delete, or may spend up to $500 but not
          $5,000.
        </p>
        <p>
          OAuth scopes are better, but they operate at the integration level, not
          the action level. A scope like <code>commerce:write</code> grants
          purchase capability for the entire integration — not just for agent
          Ollie, not just for this week, not just for amounts under $200.
        </p>
        <p>
          As agents become the primary consumer of APIs, integration-level grants
          are too coarse. A single OAuth token shared across an agent&apos;s actions
          cannot express the difference between an agent being permitted to browse
          and an agent being permitted to buy.
        </p>

        <div className="blog-section-label">
          <span>02</span>
          <h2>The granularity problem</h2>
        </div>
        <p>
          Consider an agent that does the following across a day:
        </p>
        <ul className="blog-prose__list">
          <li>Reads your calendar to schedule a meeting.</li>
          <li>Books a flight based on the meeting location.</li>
          <li>Charges a corporate card for $1,200.</li>
          <li>Sends a contract on your behalf.</li>
          <li>Grants access to a shared drive folder.</li>
        </ul>
        <p>
          Each of these actions has a different risk profile. You might trust the
          agent to read your calendar and book travel, but want to review contract
          sends and access grants before they happen. An API key that authorizes
          the agent doesn&apos;t capture any of that nuance.
        </p>
        <div className="blog-note">
          The authorization problem for agents is not identity — it&apos;s scope. And
          scope needs to be enforced at the action level, not the integration
          level.
        </div>

        <div className="blog-section-label">
          <span>03</span>
          <h2>What a permission passport adds</h2>
        </div>
        <p>
          A permission passport is a set of scoped grants attached to a specific
          agent identity. Each scope defines what actions are allowed, what
          resources are in scope, what actions are explicitly blocked, and when the
          grant expires.
        </p>
        <CodeBlock label="example passport scope">{`{
  "resource": "commerce",
  "allowedActions": ["browse", "add_to_cart"],
  "blockedActions": ["purchase", "refund"],
  "requiresApproval": false,
  "expiresAt": "2026-05-30T00:00:00Z"
}`}</CodeBlock>
        <p>
          The passport is readable by the agent before it acts — it can check what
          it&apos;s allowed to do without needing to attempt the action and get denied.
          And it&apos;s enforced at the decision boundary — every action is verified
          against the active passport before it runs.
        </p>

        <div className="blog-section-label">
          <span>04</span>
          <h2>The verification step</h2>
        </div>
        <p>
          The verify call is what makes the passport meaningful. Without it, the
          passport is just documentation. With it, the passport is a permission
          boundary.
        </p>
        <CodeBlock label="verify before act">{`import { BehalfID } from "@behalfid/sdk";

const behalf = new BehalfID({ apiKey: process.env.BEHALFID_API_KEY });

const decision = await behalf.verify({
  agentId: "agent_ollie",
  action: "purchase",
  vendor: "coachella.com",
  amount: 742
});

if (!decision.allowed) {
  throw new Error(decision.reason);
}

await charge(vendor, amount);`}</CodeBlock>
        <p>
          The agent&apos;s API key authenticates the call. BehalfID checks the passport,
          evaluates the scope against the requested action, and returns a decision.
          The executor only runs after an explicit allow. The decision is logged
          with a stable <code>requestId</code> for audit.
        </p>
        <p>
          This is the meaningful difference between API key authorization and
          passport-based permission enforcement: the scope is checked per action,
          per agent, at runtime — not once at integration setup and then forgotten.
        </p>
      </>
    )
  }
];

export function getPost(slug: string): Post | undefined {
  return posts.find((p) => p.slug === slug);
}

export function getPostMeta(): PostMeta[] {
  return posts.map(({ content: _content, ...meta }) => meta);
}
