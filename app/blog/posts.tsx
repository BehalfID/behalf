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
  },

  {
    slug: "connected-vs-native-agents",
    title: "Connected agents vs native agents: choosing the right integration model",
    date: "2026-05-08",
    dateLabel: "May 8, 2026",
    readingTime: "4 min read",
    excerpt:
      "BehalfID supports two agent models. Native agents are custom integrations you build and control. Connected agents represent external tools — ChatGPT, Claude, Zapier — that you don't control at the protocol level. The distinction changes what enforcement looks like.",
    tags: ["agents", "architecture"],
    content: (
      <>
        <p>
          BehalfID has two agent types: native and connected. They share the same
          passport and verify model, but they exist for different reasons and come
          with meaningfully different enforcement guarantees.
        </p>

        <div className="blog-section-label">
          <span>01</span>
          <h2>Native agents</h2>
        </div>
        <p>
          A native agent is an identity you create and own inside BehalfID. It has
          an API key, a passport, and a verify integration that your code controls
          end-to-end. The agent can be anything — a script, a workflow runner, an
          LLM with tool use — as long as your code calls{" "}
          <code>behalf.verify()</code> before executing each action.
        </p>
        <CodeBlock label="native agent verify">{`import { BehalfID } from "@behalfid/sdk";

const behalf = new BehalfID({ apiKey: process.env.BEHALFID_AGENT_KEY });

const decision = await behalf.verify({
  agentId: "agent_my_workflow",
  action: "send_email",
  vendor: "gmail.com"
});

if (!decision.allowed) throw new Error(decision.reason);
await sendEmail(recipient, body);`}</CodeBlock>
        <p>
          Because you control the integration, enforcement is automatic. If you
          wire the verify call correctly and fail closed on denial, BehalfID&apos;s
          decision is binding. The executor never runs without an explicit allow.
        </p>

        <div className="blog-section-label">
          <span>02</span>
          <h2>Connected agents</h2>
        </div>
        <p>
          A connected agent manually represents an external tool you don&apos;t control
          at the protocol level — ChatGPT, Claude, Zapier, Make, Ollie, or any
          other service where you can&apos;t inject a verify call before the agent acts.
        </p>
        <p>
          When you create a connected agent in BehalfID, you record its provider
          and any metadata. You then generate a <em>passport link</em> — a
          scoped URL that exposes the agent&apos;s active permission scopes. The
          external agent (or you) can read that link to understand what it&apos;s
          allowed to do before acting.
        </p>
        <div className="blog-note">
          Connected agent passports are guidance, not automatic enforcement.
          The external agent must read and respect the passport. If it ignores
          the constraints, BehalfID cannot intercept the action inside a
          third-party provider.
        </div>

        <div className="blog-section-label">
          <span>03</span>
          <h2>The three passport surfaces</h2>
        </div>
        <p>
          For connected agents that can&apos;t call the verify API, BehalfID offers
          three manual surfaces to communicate constraints:
        </p>
        <ul className="blog-prose__list">
          <li>
            <strong>Passport link.</strong> A <code>#token=…</code> URL that
            exposes the active scopes. Works for agents that can fetch URLs and
            execute JavaScript. Most consumer AI assistants cannot.
          </li>
          <li>
            <strong>Agent memory block.</strong> A structured plain-English copy
            of the scopes. Paste into the agent&apos;s memory or system prompt. Treated
            as best-effort — agents may compress or ignore saved memory.
          </li>
          <li>
            <strong>Per-task permission prompt.</strong> A full scope list, a
            blocked-actions section, and three questions the agent should answer
            before proceeding. Paste directly into the active chat. More reliable
            than memory because it&apos;s in the active context window, not stored
            state.
          </li>
        </ul>

        <div className="blog-section-label">
          <span>04</span>
          <h2>Which model to use</h2>
        </div>
        <p>
          If you are building the integration, use a native agent. You control
          the code, you can wire the verify call, and enforcement is automatic and
          binding. The passport is enforced at the decision boundary, not
          communicated as guidance.
        </p>
        <p>
          If you are working with an external agent you can&apos;t modify — an
          assistant product, a no-code automation, a third-party workflow — use a
          connected agent. The passport gives the agent a readable record of its
          constraints. Combined with a per-task prompt, it&apos;s the most reliable
          available option short of integration-level enforcement.
        </p>
        <p>
          Developer integration remains the only path to automatic enforcement.
          Connected agents are a testing and communication tool for agents you
          don&apos;t own.
        </p>
      </>
    )
  },

  {
    slug: "webhooks-as-agent-audit-layer",
    title: "Webhooks as an audit layer: signed events for agent observability",
    date: "2026-05-10",
    dateLabel: "May 10, 2026",
    readingTime: "5 min read",
    excerpt:
      "The verify response tells your integration what was decided. Webhooks tell everything else — your SIEM, your alerting system, your audit database — asynchronously and in real time. Here's how BehalfID's outbox-backed delivery model works.",
    tags: ["webhooks", "observability"],
    content: (
      <>
        <p>
          The verify response is synchronous — your integration gets the decision
          before the executor runs. But not every system that cares about agent
          decisions is in the request path. Your security tooling, alerting
          pipeline, compliance log, and audit database all need to know what
          happened, and they shouldn&apos;t have to poll.
        </p>
        <p>
          That&apos;s what webhooks are for. BehalfID emits a signed event for every
          verify decision — <code>verification.allowed</code>,{" "}
          <code>verification.denied</code>, or{" "}
          <code>verification.requires_approval</code> — and delivers it to your
          configured endpoint through an outbox-backed retry system.
        </p>

        <div className="blog-section-label">
          <span>01</span>
          <h2>The event payload</h2>
        </div>
        <p>
          Each webhook event carries the same information as the verify response,
          plus routing metadata:
        </p>
        <CodeBlock label="verification.denied event">{`{
  "eventId": "evt_01hx…",
  "type": "verification.denied",
  "createdAt": "2026-05-10T14:22:08.412Z",
  "data": {
    "requestId": "req_01hvz8…",
    "agentId": "agent_ollie",
    "decision": "denied",
    "reason": "No active purchase permission",
    "action": "purchase",
    "vendor": "coachella.com",
    "amount": 742,
    "riskLevel": "medium"
  }
}`}</CodeBlock>
        <p>
          <code>eventId</code> is unique per event and stable across delivery
          retries — use it to deduplicate. <code>requestId</code> links back to
          the verify call that produced this event and to the audit log entry.
        </p>

        <div className="blog-section-label">
          <span>02</span>
          <h2>Signature verification</h2>
        </div>
        <p>
          Every event is signed with HMAC-SHA256 over{" "}
          <code>timestamp.rawBody</code> using the derived key from your{" "}
          <code>whsec_</code> secret. Verify the signature before processing any
          event — never trust an unsigned or unverified payload.
        </p>
        <CodeBlock label="receiver.ts">{`import { verifyWebhookSignature } from "@behalfid/sdk";

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("behalfid-signature") ?? "";
  const timestamp = req.headers.get("behalfid-timestamp") ?? "";

  const event = verifyWebhookSignature({
    body,
    signature,
    timestamp,
    secret: process.env.BEHALFID_WEBHOOK_SECRET!
  });

  // event is now verified — safe to process
  if (event.type === "verification.denied") {
    await alertingPipeline.send(event.data);
  }

  return new Response("ok", { status: 200 });
}`}</CodeBlock>
        <div className="blog-note">
          Return <code>200</code> as soon as you&apos;ve verified and enqueued the
          event. Do not block the webhook response on downstream processing —
          slow receivers trigger retries.
        </div>

        <div className="blog-section-label">
          <span>03</span>
          <h2>Delivery guarantees and retries</h2>
        </div>
        <p>
          BehalfID writes events to an outbox before delivering them. If your
          endpoint is unreachable or returns a non-2xx response, delivery is
          retried up to five times with a capped backoff. After five failures, the
          event moves to dead-letter state.
        </p>
        <ul className="blog-prose__list">
          <li>
            <strong>At-least-once delivery.</strong> An event may be delivered
            more than once — on retries, or after a manual replay. Always
            deduplicate by <code>eventId</code>.
          </li>
          <li>
            <strong>Dead-letter replay.</strong> Dead-lettered events are visible
            in the console and can be replayed manually. Useful when your receiver
            was down during a burst of denials you care about.
          </li>
          <li>
            <strong>No ordering guarantee.</strong> Events are delivered
            roughly in order but retry jitter can cause out-of-order arrival.
            Use <code>createdAt</code> to reconstruct sequence if needed.
          </li>
        </ul>

        <div className="blog-section-label">
          <span>04</span>
          <h2>What to build on top of it</h2>
        </div>
        <p>
          Webhooks are the right hook for anything that needs to react to agent
          decisions outside the request path:
        </p>
        <ul className="blog-prose__list">
          <li>
            <strong>Alerting.</strong> Page on-call when a high-risk action is
            denied or when a single agent produces an unusual spike of denials
            within a window.
          </li>
          <li>
            <strong>Compliance logging.</strong> Pipe every{" "}
            <code>verification.*</code> event to an append-only audit store with
            the <code>requestId</code>, <code>eventId</code>, agent, action, and
            timestamp. Immutable records per decision.
          </li>
          <li>
            <strong>Human-in-the-loop queues.</strong> On{" "}
            <code>verification.requires_approval</code>, push the event to a
            review queue where a human can approve or deny before the agent is
            unblocked.
          </li>
          <li>
            <strong>Revocation triggers.</strong> If an agent produces a pattern
            of high-risk denials, automatically disable the agent or revoke
            a specific scope.
          </li>
        </ul>
        <p>
          The verify API handles the decision. Webhooks handle everything that
          needs to react to it.
        </p>
      </>
    )
  },

  {
    slug: "requires-approval-pattern",
    title: "Requires approval: when agents should pause before acting",
    date: "2026-05-13",
    dateLabel: "May 13, 2026",
    readingTime: "4 min read",
    excerpt:
      "Not every action is a binary allow-or-deny. Some actions are within scope but high enough risk that a human should review before the agent proceeds. That's what requiresApproval is for — and wiring it correctly is different from wiring a denial.",
    tags: ["enforcement", "ux"],
    content: (
      <>
        <p>
          BehalfID verify decisions have three outcomes: <code>allowed</code>,{" "}
          <code>denied</code>, and <code>requires_approval</code>. Most
          integrations handle the first two immediately. The third is where most
          implementations skip a step.
        </p>
        <p>
          <code>requires_approval</code> is not a soft denial. It means the action
          is within the agent&apos;s scope but should not execute until a human
          reviews it. The agent pauses. The request surfaces for review. Execution
          resumes — or is cancelled — based on that review.
        </p>

        <div className="blog-section-label">
          <span>01</span>
          <h2>When to use requiresApproval</h2>
        </div>
        <p>
          Set <code>requiresApproval: true</code> on a permission scope when the
          action is legitimate but carries enough risk that autonomous execution
          is unacceptable without a checkpoint.
        </p>
        <ul className="blog-prose__list">
          <li>
            Large financial transactions above a configured threshold —
            purchases above $500, wire transfers, subscription sign-ups.
          </li>
          <li>
            Irreversible actions — deleting data, sending external communications,
            granting third-party access, modifying account settings.
          </li>
          <li>
            Actions outside normal operating hours or geographic context.
          </li>
          <li>
            First-time actions from a newly created or recently modified agent.
          </li>
        </ul>
        <p>
          The distinction from <code>blockedActions</code> is intent:{" "}
          <code>blockedActions</code> means the agent must never do this.{" "}
          <code>requiresApproval</code> means the agent can do this, but not
          autonomously.
        </p>

        <div className="blog-section-label">
          <span>02</span>
          <h2>Handling it in code</h2>
        </div>
        <p>
          The wrong pattern is treating <code>requires_approval</code> like{" "}
          <code>denied</code> — throwing immediately and discarding the request.
          That loses the context the reviewer needs to make a decision.
        </p>
        <CodeBlock label="approval handling">{`const decision = await behalf.verify({
  agentId,
  action: "purchase",
  vendor: "coachella.com",
  amount: 742
});

if (decision.decision === "requires_approval") {
  // Don't throw. Enqueue for human review.
  await reviewQueue.push({
    requestId: decision.requestId,
    agentId,
    action: "purchase",
    vendor: "coachella.com",
    amount: 742,
    reason: decision.reason
  });

  return { status: "pending_approval", requestId: decision.requestId };
}

if (!decision.allowed) {
  throw new Error(decision.reason);
}

// Explicit allow — proceed.
await charge(vendor, amount);`}</CodeBlock>
        <p>
          The agent suspends and returns a pending state to the caller. The review
          queue entry carries enough context — action, vendor, amount, agent, and
          the original <code>requestId</code> — for a reviewer to make a decision
          without needing to re-fetch anything.
        </p>

        <div className="blog-section-label">
          <span>03</span>
          <h2>The review queue</h2>
        </div>
        <p>
          What the review queue looks like depends on your use case, but the
          minimum it needs to capture is:
        </p>
        <ul className="blog-prose__list">
          <li>The original <code>requestId</code> from BehalfID for audit linkage.</li>
          <li>Enough action context for the reviewer to understand what they&apos;re approving.</li>
          <li>A way to resume or cancel the paused agent task when the review completes.</li>
          <li>A timeout — if no review happens within N hours, the request should expire.</li>
        </ul>
        <p>
          BehalfID emits a <code>verification.requires_approval</code> webhook
          event for each decision. Wire this to your review pipeline so reviewers
          are notified in real time rather than polling.
        </p>

        <div className="blog-section-label">
          <span>04</span>
          <h2>After the review</h2>
        </div>
        <p>
          Once a reviewer approves, your system has two options depending on how
          you built the agent task:
        </p>
        <ul className="blog-prose__list">
          <li>
            <strong>Re-verify before resuming.</strong> Call{" "}
            <code>behalf.verify()</code> again with the same parameters. If the
            scope has been updated to allow the action (or the agent re-evaluated
            its risk), the decision will be <code>allowed</code> and execution can
            continue.
          </li>
          <li>
            <strong>Bypass with an explicit approval token.</strong> If you build
            a review system where approval grants a short-lived token, the agent
            can proceed without re-verifying. This requires careful token handling
            and is only appropriate when re-verification isn&apos;t practical.
          </li>
        </ul>
        <div className="blog-note">
          The re-verify approach is simpler and safer. It keeps the permission
          boundary intact and ensures the decision reflects the current state of
          the passport, not a snapshot from before the review.
        </div>
        <p>
          If the reviewer rejects, cancel the pending task and notify the agent.
          Log the rejection — a pattern of rejections on the same action is a
          signal to tighten the scope or add it to <code>blockedActions</code>.
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
