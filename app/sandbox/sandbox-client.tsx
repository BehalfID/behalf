"use client";

import { useState } from "react";
import { ButtonLink, SplitCTAButton } from "@/components/ui";

type Decision = "allowed" | "denied" | "needs_approval" | "guidance" | "concept";

type DemoAction = {
  id: string;
  group: string;
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
    group: "Gateway",
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
    group: "Gateway",
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
    group: "Gateway",
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
    id: "denied-email",
    group: "Gateway",
    label: "Denied email send",
    eyebrow: "Gateway decision",
    requestTitle: "Ollie tries to send a user email",
    action: "send_email",
    vendor: "mail.example",
    resource: "comms.email",
    passportRule: "active scope: browse_web only",
    decision: "denied",
    executed: false,
    reason: "Email send is not in the active permission scope. Only browse_web is permitted.",
    result: "No email is dispatched. The tool call is blocked before execution.",
    auditEvent: "verification.denied queued"
  },
  {
    id: "denied-over-limit",
    group: "Gateway",
    label: "Purchase over limit",
    eyebrow: "Gateway decision",
    requestTitle: "Ollie attempts a $2,400 purchase",
    action: "purchase",
    vendor: "vendor.example",
    resource: "commerce.checkout",
    amount: 2400,
    passportRule: "purchase allowed up to $500",
    decision: "denied",
    executed: false,
    reason: "The requested amount exceeds the passport spend limit of $500.",
    result: "Purchase is blocked before the checkout tool runs.",
    auditEvent: "verification.denied queued"
  },
  {
    id: "denied-expired",
    group: "Gateway",
    label: "Expired passport",
    eyebrow: "Gateway decision",
    requestTitle: "Ollie acts on an expired passport",
    action: "browse_web",
    vendor: "example.com",
    resource: "web.public_page",
    route: "/news",
    passportRule: "passport expired 2 hours ago",
    decision: "denied",
    executed: false,
    reason: "The agent's passport has passed its expiration timestamp. All actions fail closed until renewed.",
    result: "No action runs. The agent must request a new active passport.",
    auditEvent: "verification.denied queued"
  },
  {
    id: "allowed-api-read",
    group: "Gateway",
    label: "Allowed API status read",
    eyebrow: "Gateway decision",
    requestTitle: "Ollie checks its own agent status",
    action: "api_read",
    vendor: "api.behalfid.com",
    resource: "agent.status",
    passportRule: "allow api_read on agent.status",
    decision: "allowed",
    executed: true,
    reason: "The passport explicitly allows read access to the agent's own status endpoint.",
    result: "API call proceeds. The status response is returned to the agent.",
    auditEvent: "verification.allowed queued"
  },
  {
    id: "approval-purchase",
    group: "Approval",
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
    id: "approval-export",
    group: "Approval",
    label: "Needs approval: data export",
    eyebrow: "Approval decision",
    requestTitle: "Ollie requests a full data export",
    action: "export_data",
    vendor: "storage.example",
    resource: "data.export",
    passportRule: "data exports require human sign-off",
    decision: "needs_approval",
    executed: false,
    reason: "Exports are high-risk operations. The passport requires explicit human approval before any export runs.",
    result: "Agent waits for approval signal. No data is exported until the owner confirms.",
    auditEvent: "verification.approval_required queued"
  },
  {
    id: "manual-guidance",
    group: "Manual",
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
    group: "Site Guard",
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
  ["Boundary", "The request must cross a verification point before an executor or route handler runs."],
  ["Ledger", "Allowed, denied, approval-required, guidance, and concept outcomes are visible as audit events."]
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

function boundaryValue(action: DemoAction) {
  if (action.decision === "concept") return "planned route policy";
  if (action.decision === "guidance") return "manual passport guidance";
  return "passport rule evaluated";
}

function stageClass(action: DemoAction, stage: "request" | "boundary" | "decision" | "execution" | "audit") {
  if (stage === "boundary") return "sandbox-stage--boundary";
  if (stage === "execution" && !action.executed) return "sandbox-stage--blocked";
  if (stage === "decision") return `sandbox-stage--${action.decision}`;
  return "";
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
          <p className="section-kicker">Sandbox - simulated boundary</p>
          <h1>Run a decision packet through the boundary.</h1>
          <p className="sandbox-lede">
            Select a simulated agent action and inspect the request, passport match,
            decision, execution state, and audit event. No real actions run here.
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
            <div className="sandbox-status-stack" aria-label="Decision status">
              <strong className={`decision-text decision-text--${activeAction.decision}`}>
                {decisionText(activeAction.decision)}
              </strong>
              <span>executed: {activeAction.executed ? "true" : "false"}</span>
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

          <div className="sandbox-stage-line" aria-label="Decision boundary stages">
            {[
              ["ACTION REQUEST", activeAction.action],
              ["BEHALFID DECISION BOUNDARY", boundaryValue(activeAction)],
              ["DECISION", decisionText(activeAction.decision)],
              ["EXECUTION STATE", activeAction.executed ? "true" : "false"],
              ["AUDIT EVENT", activeAction.auditEvent]
            ].map(([label, value], index) => {
              const stages = ["request", "boundary", "decision", "execution", "audit"] as const;
              const stage = stages[index];
              return (
                <div className={["sandbox-stage", stageClass(activeAction, stage)].filter(Boolean).join(" ")} key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              );
            })}
          </div>

          <div className="sandbox-console-body">
            <div className="sandbox-decision-copy">
              <span>reason</span>
              <p>{activeAction.reason}</p>
              <span>active passport rule</span>
              <p>{activeAction.passportRule}</p>
              <span>audit event</span>
              <p>{activeAction.auditEvent}</p>
            </div>

            <div className="sandbox-request-panel">
              <span>request</span>
              <pre>{requestSnippet(activeAction)}</pre>
            </div>
          </div>

          <div className="sandbox-result-line">
            <span>result</span>
            <p>{activeAction.result}</p>
            {activeAction.note ? <p>{activeAction.note}</p> : null}
          </div>
        </section>

        <aside className="action-switcher" aria-label="Action switcher">
          <div className="sandbox-panel-heading">
            <p className="section-kicker">Actions</p>
            <h2>Switch the simulated request</h2>
          </div>
          <div className="sandbox-action-grid">
            {actions.map((action, index) => (
              <div className="sandbox-action-item" key={action.id}>
                {index === 0 || actions[index - 1].group !== action.group ? (
                  <div className="sandbox-action-group">{action.group}</div>
                ) : null}
                <button
                  className={[
                    "sandbox-action-card",
                    activeAction.id === action.id ? "sandbox-action-card--active" : "",
                    `sandbox-action-card--${action.decision}`
                  ].filter(Boolean).join(" ")}
                  onClick={() => setActiveActionId(action.id)}
                  type="button"
                >
                  <span>{action.eyebrow}</span>
                  <strong>{action.label}</strong>
                  <small>{action.requestTitle}</small>
                  <em>{decisionText(action.decision)}</em>
                </button>
              </div>
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
          <SplitCTAButton leftLabel="Build" leftHref="/signup" rightLabel="Log In" rightHref="/login" />
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
