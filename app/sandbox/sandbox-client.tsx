"use client";

import { useState } from "react";
import { ButtonLink } from "@/components/ui";

type Decision = "allowed" | "denied" | "needs_approval" | "guidance" | "concept";

type DemoAction = {
  id: string;
  label: string;
  eyebrow: string;
  requestTitle: string;
  action: string;
  vendor: string;
  resource: string;
  amount?: number;
  route?: string;
  passportRule: string;
  decision: Decision;
  executed: boolean;
  reason: string;
  result: string;
  auditEvent: string;
  note?: string;
};

const actions: DemoAction[] = [
  {
    id: "denied-purchase",
    label: "Denied purchase",
    eyebrow: "Gateway decision",
    requestTitle: "Ollie attempts a $742 purchase",
    action: "purchase",
    vendor: "coachella.com",
    resource: "commerce.checkout",
    amount: 742,
    passportRule: "active scope: browse_web only",
    decision: "denied",
    executed: false,
    reason: "No active permission allows purchase.",
    result: "Execution is blocked before the purchase tool runs.",
    auditEvent: "verification.denied queued"
  },
  {
    id: "allowed-read",
    label: "Allowed public read",
    eyebrow: "Gateway decision",
    requestTitle: "Ollie reads a public docs page",
    action: "browse_web",
    vendor: "example.com",
    resource: "web.public_page",
    route: "/docs/getting-started",
    passportRule: "allow browse_web on public pages",
    decision: "allowed",
    executed: true,
    reason: "The active passport allows safe public web reads.",
    result: "Action Gateway fetches the public page. No login, form, or checkout action runs.",
    auditEvent: "verification.allowed queued"
  },
  {
    id: "denied-form",
    label: "Denied form submission",
    eyebrow: "Gateway decision",
    requestTitle: "Ollie attempts a contact form POST",
    action: "submit_form",
    vendor: "example.com",
    resource: "web.form",
    route: "/contact",
    passportRule: "active scope: browse_web only",
    decision: "denied",
    executed: false,
    reason: "Form submission changes site state and is outside the public read scope.",
    result: "No form request is sent.",
    auditEvent: "verification.denied queued"
  },
  {
    id: "approval-purchase",
    label: "Needs approval purchase",
    eyebrow: "Approval decision",
    requestTitle: "Ollie requests a $24 purchase",
    action: "purchase",
    vendor: "merchant.example",
    resource: "commerce.checkout",
    amount: 24,
    passportRule: "purchase under $25 requires approval",
    decision: "needs_approval",
    executed: false,
    reason: "The amount is within the limit, but the passport requires explicit approval first.",
    result: "The agent should ask for approval. The sandbox keeps execution false.",
    auditEvent: "verification.approval_required queued"
  },
  {
    id: "manual-guidance",
    label: "Manual guidance",
    eyebrow: "Existing assistants",
    requestTitle: "User shares a manual passport",
    action: "summarize_page",
    vendor: "assistant",
    resource: "web.public_page",
    route: "/pricing",
    passportRule: "manual passport allows public summaries",
    decision: "guidance",
    executed: false,
    reason: "Manual passports guide assistants that do not integrate yet.",
    result: "No automatic enforcement happens unless the assistant or app calls BehalfID before acting.",
    auditEvent: "manual.guidance_shown",
    note: "Manual mode is best-effort guidance, not automatic enforcement."
  },
  {
    id: "site-guard-concept",
    label: "Site Guard concept",
    eyebrow: "Website access",
    requestTitle: "AI attempts protected checkout route",
    action: "checkout",
    vendor: "site-worker",
    resource: "site.checkout",
    route: "/checkout",
    passportRule: "planned route policy denies protected workflows",
    decision: "concept",
    executed: false,
    reason: "Site Guard is conceptual unless installed at middleware, worker, proxy, gateway, or another enforcement point.",
    result: "A real boundary would need to call BehalfID and respect the decision before the route handler runs.",
    auditEvent: "site_guard.concept",
    note: "Site Guard is shown as a planned website-owner path."
  }
];

const model = [
  ["Passport", "Rules define allowed actions, blocked actions, resources, limits, approval, and expiration."],
  ["Verify", "Your app, gateway, worker, middleware, or provider checks the action before it runs."],
  ["Enforce", "Allowed actions continue. Denied actions fail closed and audit the decision."]
];

function decisionText(decision: Decision) {
  if (decision === "needs_approval") return "needs approval";
  if (decision === "guidance") return "manual guidance";
  if (decision === "concept") return "planned concept";
  return decision;
}

function requestSnippet(action: DemoAction) {
  return JSON.stringify(
    {
      agent: "Ollie",
      action: action.action,
      vendor: action.vendor,
      resource: action.resource,
      ...(action.route ? { route: action.route } : {}),
      ...(action.amount ? { amount: action.amount } : {})
    },
    null,
    2
  );
}

export function SandboxClient() {
  const [activeActionId, setActiveActionId] = useState(actions[0].id);
  const [running, setRunning] = useState(false);
  const activeAction = actions.find((action) => action.id === activeActionId) ?? actions[0];

  const runTrace = async () => {
    setRunning(true);
    await new Promise((resolve) => setTimeout(resolve, 260));
    setRunning(false);
  };

  return (
    <div className="sandbox-page sandbox-simplified">
      <section className="sandbox-header sandbox-hero">
        <div>
          <p className="section-kicker">Sandbox - simulated decisions only</p>
          <h1>Watch BehalfID stop an action.</h1>
          <p className="sandbox-lede">
            Run simulated agent actions through a passport, verify decision, and
            enforcement boundary.
          </p>
        </div>
      </section>

      <section className="sandbox-focus" aria-label="Simulated BehalfID decision">
        <section className={`decision-console sandbox-trace sandbox-trace--${activeAction.decision}`} aria-live="polite">
          <div className="sandbox-trace__header">
            <div>
              <span>{activeAction.eyebrow}</span>
              <h2>{activeAction.requestTitle}</h2>
            </div>
            <button
              className="sandbox-action__btn"
              disabled={running}
              onClick={runTrace}
              type="button"
            >
              {running ? "Checking..." : "Run trace"}
            </button>
          </div>

          <div className="trace-grid trace-stack">
            <div className="trace-row trace-row--wide">
              <span>request</span>
              <pre>{requestSnippet(activeAction)}</pre>
            </div>
            <div className="trace-row">
              <span>active passport rule</span>
              <strong>{activeAction.passportRule}</strong>
            </div>
            <div className="trace-row">
              <span>decision</span>
              <strong className={`decision-text decision-text--${activeAction.decision}`}>
                {decisionText(activeAction.decision)}
              </strong>
            </div>
            <div className="trace-row">
              <span>reason</span>
              <strong>{activeAction.reason}</strong>
            </div>
            <div className="trace-row">
              <span>executed</span>
              <strong>{activeAction.executed ? "true" : "false"}</strong>
            </div>
            <div className="trace-row">
              <span>audit event</span>
              <strong>{activeAction.auditEvent}</strong>
            </div>
          </div>

          <div className="terminal-panel">
            <div className="terminal-panel__bar">
              <span>enforcement.result</span>
              <span>{decisionText(activeAction.decision)}</span>
            </div>
            <div className="terminal-panel__body">
              <p><span>result</span>{activeAction.result}</p>
              {activeAction.note ? <p><span>note</span>{activeAction.note}</p> : null}
            </div>
          </div>
        </section>

        <aside className="action-switcher" aria-label="Action switcher">
          <div className="sandbox-panel-heading">
            <p className="section-kicker">Actions</p>
            <h2>Switch the simulated request</h2>
          </div>
          <div className="sandbox-action-grid">
            {actions.map((action) => (
              <button
                className={[
                  "sandbox-action-card",
                  activeAction.id === action.id ? "sandbox-action-card--active" : "",
                  `sandbox-action-card--${action.decision}`
                ].filter(Boolean).join(" ")}
                key={action.id}
                onClick={() => setActiveActionId(action.id)}
                type="button"
              >
                <span>{action.eyebrow}</span>
                <strong>{action.label}</strong>
                <small>{action.requestTitle}</small>
                <em>{decisionText(action.decision)}</em>
              </button>
            ))}
          </div>
        </aside>
      </section>

      <section className="sandbox-layers explanation-strip" aria-label="Passport Verify Enforce model">
        {model.map(([title, body], index) => (
          <div key={title} className="sandbox-layer">
            <span>0{index + 1}</span>
            <strong>{title}</strong>
            <p>{body}</p>
          </div>
        ))}
      </section>

      <section className="sandbox-ctas">
        <h2>Add the decision point.</h2>
        <div className="hero__actions">
          <ButtonLink variant="primary" href="/signup">Start building</ButtonLink>
          <ButtonLink href="/docs/quickstart">Read quickstart</ButtonLink>
          <ButtonLink href="/docs/action-gateway">Action Gateway docs</ButtonLink>
        </div>
        <p className="sandbox-note">
          This sandbox simulates decisions locally. It does not make real network
          requests, create permissions, or execute agent actions.
        </p>
      </section>
    </div>
  );
}
