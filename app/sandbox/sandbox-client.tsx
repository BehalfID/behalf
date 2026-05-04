"use client";

import { useState } from "react";
import { ButtonLink } from "@/components/ui";

type ActionResult = {
  action: string;
  vendor: string;
  amount?: number;
  allowed: boolean;
  reason: string;
  risk: "low" | "medium" | "high";
};

const DEMO_POLICY = {
  agentName: "Ollie (sandbox)",
  agentType: "connected",
  provider: "ollie",
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

function simulateVerify(input: { action: string; vendor: string; amount?: number }): ActionResult {
  const permission = DEMO_POLICY.permissions.find(
    (p) => p.action === input.action && (p.resource === input.vendor || p.resource === "web")
  );
  if (permission) {
    return {
      ...input,
      allowed: true,
      reason: "Action allowed by active permission.",
      risk: "low"
    };
  }
  return {
    ...input,
    allowed: false,
    reason: "No active permission exists for this action.",
    risk: "high"
  };
}

const DEMO_ACTIONS = [
  {
    label: "Browse web",
    description: "Research flights to Tokyo on Google",
    input: { action: "browse_web", vendor: "web" },
    expectAllowed: true
  },
  {
    label: "Purchase ticket",
    description: "Book a $742 Coachella ticket",
    input: { action: "purchase", vendor: "coachella.com", amount: 742 },
    expectAllowed: false
  },
  {
    label: "Send message",
    description: "Send Slack message to #general",
    input: { action: "send_message", vendor: "slack.com" },
    expectAllowed: false
  }
];

export function SandboxClient() {
  const [results, setResults] = useState<Record<number, ActionResult | null>>({});
  const [running, setRunning] = useState<Record<number, boolean>>({});

  const run = async (index: number, input: { action: string; vendor: string; amount?: number }) => {
    setRunning((prev) => ({ ...prev, [index]: true }));
    await new Promise((resolve) => setTimeout(resolve, 320));
    const result = simulateVerify(input);
    setResults((prev) => ({ ...prev, [index]: result }));
    setRunning((prev) => ({ ...prev, [index]: false }));
  };

  const reset = () => {
    setResults({});
    setRunning({});
  };

  return (
    <div className="sandbox-page">
      <div className="sandbox-header">
        <p className="section-kicker">Sandbox — no real agents or secrets</p>
        <h1>Denied actions fail closed.</h1>
        <p className="sandbox-lede">
          Ollie has one permission: browse the web. It cannot make purchases or send messages.
          Click an action to see BehalfID enforce the policy before the agent proceeds.
        </p>
      </div>

      <div className="sandbox-policy">
        <div className="sandbox-policy__agent">
          <span className="console-status console-status--active">connected</span>
          <span className="console-status">{DEMO_POLICY.provider}</span>
          <strong>{DEMO_POLICY.agentName}</strong>
        </div>
        <div className="sandbox-policy__permissions">
          {DEMO_POLICY.permissions.map((p) => (
            <div key={p.action} className="sandbox-permission">
              <div className="sandbox-permission__action">{p.action}</div>
              <div className="sandbox-permission__resource">{p.resource}</div>
              {p.allowedActions.length ? (
                <div className="sandbox-permission__list sandbox-permission__list--allow">
                  <span>allows</span>
                  {p.allowedActions.map((a) => <code key={a}>{a}</code>)}
                </div>
              ) : null}
              {p.blockedActions.length ? (
                <div className="sandbox-permission__list sandbox-permission__list--block">
                  <span>blocks</span>
                  {p.blockedActions.map((a) => <code key={a}>{a}</code>)}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="sandbox-actions">
        {DEMO_ACTIONS.map((demo, index) => {
          const result = results[index] ?? null;
          const busy = running[index] ?? false;
          return (
            <div key={index} className={`sandbox-action${result ? (result.allowed ? " sandbox-action--allowed" : " sandbox-action--denied") : ""}`}>
              <div className="sandbox-action__meta">
                <strong>{demo.label}</strong>
                <span>{demo.description}</span>
                <code className="sandbox-action__call">
                  verify({`{ action: "${demo.input.action}", vendor: "${demo.input.vendor}"${demo.input.amount ? `, amount: ${demo.input.amount}` : ""} }`})
                </code>
              </div>
              {!result ? (
                <button
                  className="sandbox-action__btn"
                  disabled={busy}
                  onClick={() => run(index, demo.input)}
                  type="button"
                >
                  {busy ? "Checking..." : "Run"}
                </button>
              ) : (
                <div className="sandbox-action__result">
                  <span className={result.allowed ? "sandbox-result--allowed" : "sandbox-result--denied"}>
                    {result.allowed ? "✓ Allowed" : "✗ Denied"}
                  </span>
                  <small>{result.reason}</small>
                  {!result.allowed ? (
                    <small className="sandbox-action__fail-closed">
                      The agent stops here. Code after this call never runs.
                    </small>
                  ) : null}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {Object.keys(results).length > 0 ? (
        <div className="sandbox-reset">
          <button className="sandbox-reset__btn" onClick={reset} type="button">Reset sandbox</button>
        </div>
      ) : null}

      <div className="sandbox-pattern">
        <h2>The enforce pattern</h2>
        <p>
          Every action is gated. On denial, <code>enforceAction</code> throws — the agent never reaches the code that would have executed the action.
          This is fail closed: on denial, the safe default is to stop rather than proceed.
        </p>
        <pre className="sandbox-code">{`async function enforceAction(input) {
  const result = await behalf.verify({ agentId, ...input });
  if (!result.allowed) {
    throw new Error(\`Action blocked by BehalfID: \${result.reason}\`);
  }
  return result;
}

// browse_web is allowed — this proceeds.
await enforceAction({ action: "browse_web", vendor: "web" });
console.log("Researching flights...");

// purchase is denied — this throws. The next line never runs.
await enforceAction({ action: "purchase", vendor: "coachella.com", amount: 742 });
console.log("Booking ticket..."); // ← never reached`}</pre>
      </div>

      <div className="sandbox-ctas">
        <h2>Add enforcement to your agent.</h2>
        <div className="hero__actions">
          <ButtonLink variant="primary" href="/signup">Start building</ButtonLink>
          <ButtonLink href="/docs/quickstart">Read the quickstart</ButtonLink>
        </div>
        <p className="sandbox-note">
          This sandbox simulates BehalfID enforcement locally. No real agents, API keys, or permissions were used.
          Real enforcement requires creating an agent and calling the verification API or SDK.
        </p>
      </div>
    </div>
  );
}
