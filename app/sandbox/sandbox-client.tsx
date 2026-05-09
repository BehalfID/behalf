"use client";

import { useMemo, useState } from "react";
import { ButtonLink } from "@/components/ui";

type DemoMode = "verify" | "gateway" | "manual";

type DemoInput = {
  action: string;
  vendor: string;
  resource: string;
  url?: string;
  amount?: number;
};

type ActionResult = DemoInput & {
  allowed: boolean;
  executed: boolean;
  reason: string;
  risk: "low" | "medium" | "high";
  output?: string;
};

type DemoAction = {
  label: string;
  audience: string;
  description: string;
  input: DemoInput;
};

const DEMO_POLICY = {
  agentName: "Ollie (sandbox)",
  agentType: "connected",
  provider: "ollie",
  mode: "Manual passport + gateway demo",
  permissions: [
    {
      action: "browse_web",
      resource: "web",
      allowedActions: ["search web", "read public pages", "extract structured data"],
      blockedActions: ["submit forms", "make purchases", "login to accounts"],
      requiresApproval: false
    }
  ]
};

const layers = [
  ["Permission passport", "The readable rule set: allowed actions, blocked actions, resources, and limits."],
  ["Verify API", "The decision point your app calls before an agent performs an action."],
  ["Action Gateway", "The enforcement path for supported actions: allowed actions execute, denied actions stop."]
];

const modeCopy: Record<DemoMode, string> = {
  verify: "Verify mode answers: is this action allowed by the passport?",
  gateway: "Gateway mode shows the supported-action path: BehalfID checks first, then executes only if allowed.",
  manual: "Manual mode creates guidance for existing assistants. It is best-effort unless an app or provider enforces the decision."
};

const DEMO_ACTIONS: DemoAction[] = [
  {
    label: "Read public page",
    audience: "Developer example",
    description: "Fetch a public page summary through a supported web-read action.",
    input: { action: "browse_web", vendor: "web", resource: "web", url: "https://example.com" }
  },
  {
    label: "Purchase ticket",
    audience: "Daily-user example",
    description: "Attempt a $742 ticket purchase while the passport only allows public browsing.",
    input: { action: "purchase", vendor: "coachella.com", resource: "commerce", amount: 742 }
  },
  {
    label: "Submit contact form",
    audience: "Website-owner example",
    description: "Try to submit a form on a site workflow that the passport explicitly blocks.",
    input: { action: "submit_form", vendor: "web", resource: "form" }
  }
];

function simulateGateway(input: DemoInput): ActionResult {
  const canReadPublicWeb = input.action === "browse_web" && input.vendor === "web";

  if (canReadPublicWeb) {
    return {
      ...input,
      allowed: true,
      executed: true,
      reason: "Allowed by the active browse_web permission for public web resources.",
      risk: "low",
      output: "Public page fetched and summarized. No account login, form submission, or purchase was attempted."
    };
  }

  const isBlockedForm = input.action === "submit_form";

  return {
    ...input,
    allowed: false,
    executed: false,
    reason: isBlockedForm
      ? "Blocked by passport rule: submit forms is outside the allowed public web-read scope."
      : "No active permission covers purchases for this agent, vendor, or amount.",
    risk: isBlockedForm ? "medium" : "high"
  };
}

function formatRequest(input: DemoInput) {
  const lines = [
    `action: "${input.action}"`,
    `resource: "${input.resource}"`,
    `vendor: "${input.vendor}"`
  ];
  if (input.url) lines.push(`url: "${input.url}"`);
  if (input.amount) lines.push(`amount: ${input.amount}`);
  return lines.join(", ");
}

export function SandboxClient() {
  const [activeMode, setActiveMode] = useState<DemoMode>("gateway");
  const [activeAction, setActiveAction] = useState(0);
  const [results, setResults] = useState<Record<number, ActionResult | null>>({});
  const [running, setRunning] = useState<Record<number, boolean>>({});

  const selected = DEMO_ACTIONS[activeAction];
  const selectedResult = results[activeAction] ?? null;

  const summary = useMemo(() => {
    const completed = Object.values(results).filter(Boolean) as ActionResult[];
    return {
      checked: completed.length,
      allowed: completed.filter((result) => result.allowed).length,
      denied: completed.filter((result) => !result.allowed).length
    };
  }, [results]);

  const run = async (index: number, input: DemoInput) => {
    setActiveAction(index);
    setRunning((prev) => ({ ...prev, [index]: true }));
    await new Promise((resolve) => setTimeout(resolve, 360));
    const result = simulateGateway(input);
    setResults((prev) => ({ ...prev, [index]: result }));
    setRunning((prev) => ({ ...prev, [index]: false }));
  };

  const reset = () => {
    setResults({});
    setRunning({});
    setActiveAction(0);
  };

  return (
    <div className="sandbox-page">
      <section className="sandbox-header">
        <div>
          <p className="section-kicker">Sandbox - no real agents or secrets</p>
          <h1>See permissions become decisions.</h1>
          <p className="sandbox-lede">
            This sandbox shows how BehalfID evaluates a permission passport, returns a Verify decision,
            and enforces supported actions through the Action Gateway.
          </p>
        </div>
        <div className="sandbox-header__panel" aria-label="Sandbox run summary">
          <span>demo run</span>
          <strong>{summary.checked}/3 checked</strong>
          <div>
            <code>{summary.allowed} allowed</code>
            <code>{summary.denied} denied</code>
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

      <section className="sandbox-workspace">
        <aside className="sandbox-policy" aria-label="Permission passport">
          <div className="sandbox-panel-heading">
            <p className="section-kicker">Permission passport</p>
            <h2>{DEMO_POLICY.agentName}</h2>
          </div>
          <div className="sandbox-policy__agent">
            <span className="console-status console-status--active">connected</span>
            <span className="console-status">{DEMO_POLICY.provider}</span>
            <span className="console-status">{DEMO_POLICY.mode}</span>
          </div>
          <div className="sandbox-policy__permissions">
            {DEMO_POLICY.permissions.map((p) => (
              <div key={p.action} className="sandbox-permission">
                <div className="sandbox-permission__head">
                  <strong>{p.action}</strong>
                  <span>{p.resource}</span>
                </div>
                <div className="sandbox-permission__list sandbox-permission__list--allow">
                  <span>allows</span>
                  {p.allowedActions.map((a) => <code key={a}>{a}</code>)}
                </div>
                <div className="sandbox-permission__list sandbox-permission__list--block">
                  <span>blocks</span>
                  {p.blockedActions.map((a) => <code key={a}>{a}</code>)}
                </div>
              </div>
            ))}
          </div>
          <p className="sandbox-policy__note">
            Manual-mode instructions can describe this passport to an existing assistant. Automatic
            enforcement requires an SDK, API, gateway, middleware, or provider integration.
          </p>
        </aside>

        <div className="sandbox-demo">
          <div className="sandbox-mode-tabs" role="tablist" aria-label="Sandbox mode">
            {(["verify", "gateway", "manual"] as DemoMode[]).map((mode) => (
              <button
                key={mode}
                className={activeMode === mode ? "sandbox-mode-tabs__tab sandbox-mode-tabs__tab--active" : "sandbox-mode-tabs__tab"}
                onClick={() => setActiveMode(mode)}
                type="button"
              >
                {mode === "verify" ? "Verify mode" : mode === "gateway" ? "Gateway mode" : "Manual mode"}
              </button>
            ))}
          </div>
          <p className="sandbox-mode-copy">{modeCopy[activeMode]}</p>

          <div className="sandbox-action-grid">
            {DEMO_ACTIONS.map((demo, index) => {
              const result = results[index] ?? null;
              const busy = running[index] ?? false;
              return (
                <button
                  className={[
                    "sandbox-action-card",
                    activeAction === index ? "sandbox-action-card--active" : "",
                    result ? (result.allowed ? "sandbox-action-card--allowed" : "sandbox-action-card--denied") : ""
                  ].filter(Boolean).join(" ")}
                  key={demo.label}
                  onClick={() => {
                    setActiveAction(index);
                    if (!result && !busy) void run(index, demo.input);
                  }}
                  type="button"
                >
                  <span>{demo.audience}</span>
                  <strong>{demo.label}</strong>
                  <small>{demo.description}</small>
                  <em>{busy ? "checking" : result ? (result.allowed ? "allowed" : "denied") : "run demo"}</em>
                </button>
              );
            })}
          </div>

          <div className={selectedResult?.allowed ? "sandbox-result-panel sandbox-result-panel--allowed" : selectedResult ? "sandbox-result-panel sandbox-result-panel--denied" : "sandbox-result-panel"}>
            <div className="sandbox-result-panel__header">
              <div>
                <span>{selected.audience}</span>
                <h2>{selected.label}</h2>
              </div>
              <button
                className="sandbox-action__btn"
                disabled={running[activeAction] ?? false}
                onClick={() => run(activeAction, selected.input)}
                type="button"
              >
                {running[activeAction] ? "Checking..." : selectedResult ? "Run again" : "Run action"}
              </button>
            </div>

            <div className="sandbox-result-grid">
              <div>
                <span>request</span>
                <code>{`executeAction({ ${formatRequest(selected.input)} })`}</code>
              </div>
              <div>
                <span>decision</span>
                <strong className={selectedResult?.allowed ? "sandbox-result--allowed" : selectedResult ? "sandbox-result--denied" : ""}>
                  {selectedResult ? (selectedResult.allowed ? "allowed" : "denied") : "not checked"}
                </strong>
              </div>
              <div>
                <span>executed</span>
                <strong>{selectedResult ? (selectedResult.executed ? "yes" : "no") : "pending"}</strong>
              </div>
              <div>
                <span>risk</span>
                <strong>{selectedResult?.risk ?? "pending"}</strong>
              </div>
            </div>

            <div className="sandbox-reason">
              <span>why</span>
              <p>{selectedResult?.reason ?? "Run the action to see BehalfID evaluate it against the active passport."}</p>
            </div>

            {selectedResult?.output ? (
              <div className="sandbox-output">
                <span>output</span>
                <p>{selectedResult.output}</p>
              </div>
            ) : null}

            {selectedResult && !selectedResult.allowed ? (
              <div className="sandbox-output sandbox-output--blocked">
                <span>gateway result</span>
                <p>The agent stops here. The supported executor is not called, so the action does not happen.</p>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {summary.checked > 0 ? (
        <div className="sandbox-reset">
          <button className="sandbox-reset__btn" onClick={reset} type="button">Reset sandbox</button>
        </div>
      ) : null}

      <section className="sandbox-pattern">
        <div>
          <p className="section-kicker">Enforcement pattern</p>
          <h2>Check first. Execute only if allowed.</h2>
          <p>
            Verify mode is the decision. Action Gateway is the supported execution path.
            Manual mode is useful for guidance, but it is not automatic enforcement by itself.
          </p>
        </div>
        <pre className="sandbox-code">{`const result = await behalf.executeAction({
  agentId,
  action: "browse_web",
  resource: "web",
  input: { url: "https://example.com" }
});

if (!result.executed) {
  throw new Error(result.reason);
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
