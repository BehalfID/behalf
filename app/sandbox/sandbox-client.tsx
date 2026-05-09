"use client";

import { useMemo, useState } from "react";
import { ButtonLink } from "@/components/ui";

type Decision = "allowed" | "denied" | "needs_approval";
type LaneId = "developer" | "daily-user" | "site-guard";

type DemoAction = {
  id: string;
  label: string;
  requestLabel: string;
  description: string;
  action: string;
  resource: string;
  vendor: string;
  amount?: number;
  route?: string;
  decision: Decision;
  executed: boolean;
  reason: string;
  matchedRule: string;
  result: string;
  badge: string;
};

type DemoLane = {
  id: LaneId;
  eyebrow: string;
  title: string;
  summary: string;
  mode: string;
  status?: string;
  actions: DemoAction[];
};

const layers = [
  ["Passport", "Readable permission rules: scopes, resources, limits, approval, and expiration."],
  ["Verify", "The decision point your app, gateway, worker, or provider calls before action."],
  ["Enforce", "Allowed actions continue. Denied actions fail closed before execution."]
];

const lanes: DemoLane[] = [
  {
    id: "developer",
    eyebrow: "Developer workflow",
    title: "App calls Verify API",
    summary: "Simulate an app checking actions against a passport, then executing only supported allowed actions through the gateway.",
    mode: "SDK + Verify + Action Gateway",
    actions: [
      {
        id: "dev-read",
        label: "Read public page",
        requestLabel: "Read public page through Action Gateway",
        description: "A supported read action runs after Verify returns allowed.",
        action: "browse_web",
        resource: "web.public_page",
        vendor: "example.com",
        route: "/docs/getting-started",
        decision: "allowed",
        executed: true,
        reason: "Allowed by active browse_web permission for public web resources.",
        matchedRule: "allow browse_web on public pages",
        result: "Public page fetched and summarized. No login, form submission, or purchase was attempted.",
        badge: "executed"
      },
      {
        id: "dev-purchase",
        label: "Attempt purchase",
        requestLabel: "Attempt purchase",
        description: "A commerce action has no matching active permission.",
        action: "purchase",
        resource: "commerce.checkout",
        vendor: "coachella.com",
        amount: 742,
        decision: "denied",
        executed: false,
        reason: "No active permission covers purchases for this agent, vendor, or amount.",
        matchedRule: "blocked by missing commerce permission",
        result: "Gateway stops before the executor receives the request.",
        badge: "fail closed"
      },
      {
        id: "dev-form",
        label: "Submit form",
        requestLabel: "Attempt form submission",
        description: "The passport allows reading public pages, not changing site state.",
        action: "submit_form",
        resource: "web.form",
        vendor: "example.com",
        route: "/contact",
        decision: "denied",
        executed: false,
        reason: "Blocked by passport rule: form submission is outside the allowed public web-read scope.",
        matchedRule: "deny submit forms",
        result: "No form POST is sent.",
        badge: "fail closed"
      }
    ]
  },
  {
    id: "daily-user",
    eyebrow: "Daily-user assistant",
    title: "Manual passport guides an existing assistant",
    summary: "Manual mode translates a passport into boundaries a user can share with assistants that do not integrate yet.",
    mode: "Manual guidance",
    actions: [
      {
        id: "user-summary",
        label: "Summarize page",
        requestLabel: "Summarize public page",
        description: "A read-only assistant task is in scope.",
        action: "summarize_page",
        resource: "web.public_page",
        vendor: "web",
        route: "/pricing",
        decision: "allowed",
        executed: false,
        reason: "Manual guidance says public summaries are allowed. Enforcement depends on the assistant or app honoring the passport.",
        matchedRule: "allow read-only public web tasks",
        result: "Share the passport instructions with the assistant. No automatic execution happens in manual mode.",
        badge: "manual guidance"
      },
      {
        id: "user-approval",
        label: "Purchase under $25",
        requestLabel: "Purchase under $25 with approval required",
        description: "The passport requires user confirmation before spending money.",
        action: "purchase",
        resource: "commerce.checkout",
        vendor: "merchant.example",
        amount: 24,
        decision: "needs_approval",
        executed: false,
        reason: "The requested amount is under the limit, but the passport requires approval before purchase.",
        matchedRule: "approval required for commerce under $25",
        result: "Assistant should ask for explicit approval. In this sandbox, execution remains false.",
        badge: "needs approval"
      },
      {
        id: "user-full-access",
        label: "Full access",
        requestLabel: "Request full access to everything",
        description: "Broad, undefined authority is rejected.",
        action: "unbounded_access",
        resource: "all",
        vendor: "assistant",
        decision: "denied",
        executed: false,
        reason: "The request is too broad and does not map to a specific allowed action, resource, or limit.",
        matchedRule: "block unscoped authority",
        result: "Clarify the exact task and scope before creating a passport.",
        badge: "blocked"
      }
    ]
  },
  {
    id: "site-guard",
    eyebrow: "Website owner / Site Guard",
    title: "Site Guard checks AI access at the boundary",
    summary: "A planned Site Guard enforcement point can evaluate route-level rules before traffic reaches protected workflows.",
    mode: "Planned Site Guard concept",
    status: "planned",
    actions: [
      {
        id: "site-docs",
        label: "Read docs page",
        requestLabel: "AI reads public docs page",
        description: "Public documentation can be summarized and cited.",
        action: "read_route",
        resource: "site.public_docs",
        vendor: "site-worker",
        route: "/docs",
        decision: "allowed",
        executed: true,
        reason: "Route policy allows AI reads for public documentation pages.",
        matchedRule: "allow GET /docs",
        result: "Boundary forwards the request to the public docs route.",
        badge: "allowed"
      },
      {
        id: "site-contact",
        label: "Submit contact form",
        requestLabel: "AI submits contact form",
        description: "State-changing form routes are blocked by default.",
        action: "submit_form",
        resource: "site.contact_form",
        vendor: "site-worker",
        route: "/contact",
        decision: "denied",
        executed: false,
        reason: "Site Guard concept blocks form submissions unless an enforcement point has an explicit allow rule.",
        matchedRule: "deny POST /contact",
        result: "Boundary returns a denied decision before the form handler runs.",
        badge: "fail closed"
      },
      {
        id: "site-checkout",
        label: "Attempt checkout",
        requestLabel: "AI attempts checkout route",
        description: "Sensitive commerce routes require stronger authorization.",
        action: "checkout",
        resource: "site.checkout",
        vendor: "site-worker",
        route: "/checkout",
        decision: "denied",
        executed: false,
        reason: "Checkout is a protected workflow and no verified permission permits this action.",
        matchedRule: "deny /checkout for AI traffic",
        result: "The route fails closed at the worker or gateway boundary.",
        badge: "fail closed"
      },
      {
        id: "site-crawl",
        label: "Bulk crawl docs",
        requestLabel: "AI bulk crawls docs",
        description: "Bulk access can be rate-limited or denied by route policy.",
        action: "bulk_crawl",
        resource: "site.public_docs",
        vendor: "site-worker",
        route: "/docs/*",
        decision: "denied",
        executed: false,
        reason: "Bulk crawling exceeds the route policy for public docs access.",
        matchedRule: "deny high-volume crawl",
        result: "Boundary rejects or rate-limits the crawl according to site policy.",
        badge: "rate-limited"
      }
    ]
  }
];

function decisionText(decision: Decision) {
  if (decision === "needs_approval") return "needs approval";
  return decision;
}

function requestSnippet(action: DemoAction) {
  return JSON.stringify(
    {
      agentId: "agent_sandbox_ollie",
      action: action.action,
      resource: action.resource,
      vendor: action.vendor,
      ...(action.route ? { route: action.route } : {}),
      ...(action.amount ? { amount: action.amount } : {})
    },
    null,
    2
  );
}

export function SandboxClient() {
  const [activeLaneId, setActiveLaneId] = useState<LaneId>("developer");
  const [activeActionId, setActiveActionId] = useState("dev-read");
  const [running, setRunning] = useState(false);
  const [checkedIds, setCheckedIds] = useState<string[]>(["dev-read"]);

  const activeLane = lanes.find((lane) => lane.id === activeLaneId) ?? lanes[0];
  const activeAction = activeLane.actions.find((action) => action.id === activeActionId) ?? activeLane.actions[0];

  const summary = useMemo(() => {
    const allActions = lanes.flatMap((lane) => lane.actions);
    const checked = allActions.filter((action) => checkedIds.includes(action.id));
    return {
      checked: checked.length,
      allowed: checked.filter((action) => action.decision === "allowed").length,
      denied: checked.filter((action) => action.decision === "denied").length,
      approval: checked.filter((action) => action.decision === "needs_approval").length
    };
  }, [checkedIds]);

  const selectLane = (lane: DemoLane) => {
    setActiveLaneId(lane.id);
    setActiveActionId(lane.actions[0].id);
    setRunning(false);
  };

  const runAction = async (actionId = activeAction.id) => {
    setRunning(true);
    await new Promise((resolve) => setTimeout(resolve, 280));
    setCheckedIds((previous) => previous.includes(actionId) ? previous : [...previous, actionId]);
    setRunning(false);
  };

  const selectAction = (action: DemoAction) => {
    setActiveActionId(action.id);
    if (!checkedIds.includes(action.id)) void runAction(action.id);
  };

  const reset = () => {
    setCheckedIds([]);
    setRunning(false);
  };

  return (
    <div className="sandbox-page">
      <section className="sandbox-header">
        <div>
          <p className="section-kicker">Sandbox - simulated decisions only</p>
          <h1>See permissions become enforcement.</h1>
          <p className="sandbox-lede">
            Run simulated agent actions through passports, verification, gateway enforcement,
            manual guidance, and planned site access rules.
          </p>
        </div>
        <div className="sandbox-header__panel" aria-label="Sandbox run summary">
          <span>decision run</span>
          <strong>{summary.checked}/10 checked</strong>
          <div>
            <code>{summary.allowed} allowed</code>
            <code>{summary.denied} denied</code>
            <code>{summary.approval} approval</code>
          </div>
        </div>
      </section>

      <section className="sandbox-layers" aria-label="BehalfID product layers">
        {layers.map(([title, body], index) => (
          <div key={title} className="sandbox-layer">
            <span>0{index + 1}</span>
            <strong>{title}</strong>
            <p>{body}</p>
          </div>
        ))}
      </section>

      <section className="sandbox-shell">
        <aside className="sandbox-scenarios" aria-label="Scenario selector">
          <div className="sandbox-panel-heading">
            <p className="section-kicker">Scenario selector</p>
            <h2>Choose an enforcement surface</h2>
          </div>

          <div className="sandbox-scenario-list">
            {lanes.map((lane) => (
              <button
                className={[
                  "sandbox-scenario",
                  activeLane.id === lane.id ? "sandbox-scenario--active" : ""
                ].filter(Boolean).join(" ")}
                key={lane.id}
                onClick={() => selectLane(lane)}
                type="button"
              >
                <span>{lane.eyebrow}</span>
                <strong>{lane.title}</strong>
                <small>{lane.summary}</small>
                <em>{lane.mode}</em>
              </button>
            ))}
          </div>

          <div className="sandbox-passport-card">
            <span>active passport</span>
            <strong>Ollie (sandbox)</strong>
            <p>Allows public web reads. Blocks forms, checkout, account login, and unscoped authority unless a narrower rule applies.</p>
          </div>
        </aside>

        <div className="sandbox-demo">
          <div className="sandbox-demo__header">
            <div>
              <p className="section-kicker">{activeLane.eyebrow}</p>
              <h2>{activeLane.title}</h2>
            </div>
            <div className="sandbox-demo__badges">
              {activeLane.status ? <span className="decision-chip decision-chip--planned">{activeLane.status}</span> : null}
              <span className="decision-chip">{activeLane.mode}</span>
            </div>
          </div>

          <div className="sandbox-action-grid">
            {activeLane.actions.map((action) => {
              const checked = checkedIds.includes(action.id);
              return (
                <button
                  className={[
                    "sandbox-action-card",
                    activeAction.id === action.id ? "sandbox-action-card--active" : "",
                    checked ? `sandbox-action-card--${action.decision}` : ""
                  ].filter(Boolean).join(" ")}
                  key={action.id}
                  onClick={() => selectAction(action)}
                  type="button"
                >
                  <span>{action.requestLabel}</span>
                  <strong>{action.label}</strong>
                  <small>{action.description}</small>
                  <em>{checked ? decisionText(action.decision) : "run trace"}</em>
                </button>
              );
            })}
          </div>

          <section className={`sandbox-trace sandbox-trace--${activeAction.decision}`} aria-live="polite">
            <div className="sandbox-trace__header">
              <div>
                <span>Decision console</span>
                <h2>{activeAction.requestLabel}</h2>
              </div>
              <button
                className="sandbox-action__btn"
                disabled={running}
                onClick={() => runAction(activeAction.id)}
                type="button"
              >
                {running ? "Checking..." : "Run trace"}
              </button>
            </div>

            <div className="trace-grid">
              <div className="trace-row trace-row--wide">
                <span>request</span>
                <pre>{requestSnippet(activeAction)}</pre>
              </div>
              <div className="trace-row">
                <span>decision</span>
                <strong className={`decision-text decision-text--${activeAction.decision}`}>
                  {decisionText(activeAction.decision)}
                </strong>
              </div>
              <div className="trace-row">
                <span>executed</span>
                <strong>{activeAction.executed ? "true" : "false"}</strong>
              </div>
              <div className="trace-row">
                <span>matched rule</span>
                <strong>{activeAction.matchedRule}</strong>
              </div>
              <div className="trace-row">
                <span>audit event</span>
                <strong>queued</strong>
              </div>
            </div>

            <div className="terminal-panel">
              <div className="terminal-panel__bar">
                <span>verification.trace</span>
                <span>{activeAction.badge}</span>
              </div>
              <div className="terminal-panel__body">
                <p><span>reason</span>{activeAction.reason}</p>
                <p><span>result</span>{activeAction.result}</p>
                {activeLane.id === "site-guard" ? (
                  <p><span>boundary</span>Site Guard is shown as a planned concept unless installed as middleware, a worker, or a gateway.</p>
                ) : null}
                {activeLane.id === "daily-user" ? (
                  <p><span>manual</span>Manual passports guide existing assistants; automatic enforcement requires an integration that checks BehalfID.</p>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      </section>

      {summary.checked > 0 ? (
        <div className="sandbox-reset">
          <button className="sandbox-reset__btn" onClick={reset} type="button">Reset traces</button>
        </div>
      ) : null}

      <section className="sandbox-pattern">
        <div>
          <p className="section-kicker">Enforcement pattern</p>
          <h2>Passport to decision to boundary.</h2>
          <p>
            Verify is the decision. Action Gateway is the supported execution path.
            Manual mode is useful guidance. Site Guard requires a real enforcement point.
          </p>
        </div>
        <pre className="sandbox-code">{`const result = await behalf.verify({
  agentId,
  action: "submit_form",
  resource: "site.contact_form"
});

if (!result.allowed) {
  return failClosed(result.reason);
}`}</pre>
      </section>

      <section className="sandbox-ctas">
        <h2>Add enforcement to your agent.</h2>
        <div className="hero__actions">
          <ButtonLink variant="primary" href="/signup">Start building</ButtonLink>
          <ButtonLink href="/docs/quickstart">Read quickstart</ButtonLink>
          <ButtonLink href="/docs/action-gateway">Action Gateway docs</ButtonLink>
        </div>
        <p className="sandbox-note">
          This sandbox simulates enforcement locally. No real agents, API keys, permissions, or
          network requests were used.
        </p>
      </section>
    </div>
  );
}
