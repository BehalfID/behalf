"use client";

import { useState } from "react";
import { ButtonLink, SplitCTAButton } from "@/components/ui";

const LAB_STYLES = `
.lab-agent-role{color:rgba(255,255,255,.54);font-size:.84rem}
.lab-decision-columns{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));margin-bottom:clamp(24px,3.5vw,38px);border:1px solid rgba(255,255,255,.1);border-radius:12px;overflow:hidden}
.lab-decision-col{display:grid;align-content:start;gap:12px;padding:clamp(16px,2.2vw,22px);border-right:1px solid rgba(255,255,255,.09)}
.lab-decision-col:last-child{border-right:0}
.lab-decision-col>span{color:rgba(255,255,255,.5);font-size:.68rem;font-weight:820;letter-spacing:.1em;text-transform:uppercase}
.lab-request-fields{display:grid;gap:7px;margin:0}
.lab-request-fields div{display:grid;grid-template-columns:68px minmax(0,1fr);gap:8px}
.lab-request-fields dt{color:rgba(255,255,255,.42);font-family:var(--font-mono);font-size:.72rem;line-height:1.55}
.lab-request-fields dd{margin:0;color:rgba(255,255,255,.86);font-family:var(--font-mono);font-size:.8rem;line-height:1.55;overflow-wrap:anywhere}
.lab-passport-rule{display:block;color:#fff;font-size:.94rem;line-height:1.42}
.lab-passport-detail{margin:0;color:rgba(255,255,255,.58);font-size:.82rem;line-height:1.56}
.lab-verdict{width:max-content;display:inline-flex;align-items:center;border:1px solid;border-radius:999px;padding:5px 12px;font-size:.74rem;font-weight:760;font-style:normal;letter-spacing:.06em;text-transform:uppercase}
.lab-verdict--allowed{border-color:rgba(16,185,129,.32);color:#6ee7b7;background:rgba(16,185,129,.08)}
.lab-verdict--denied{border-color:rgba(239,68,68,.32);color:#fca5a5;background:rgba(239,68,68,.08)}
.lab-verdict--needs_approval{border-color:rgba(234,179,8,.32);color:#fcd34d;background:rgba(234,179,8,.06)}
.lab-verdict-headline{margin:0;color:#fff;font-size:.96rem;font-weight:660;line-height:1.38}
.lab-verdict-sub{margin:0;color:rgba(255,255,255,.58);font-size:.84rem;line-height:1.52}
.lab-result-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);margin-top:clamp(22px,3.5vw,38px);border-top:1px solid rgba(255,255,255,.1)}
.lab-result-col{display:grid;align-content:start;gap:8px;padding:clamp(14px,2vw,20px) 0}
.lab-result-col+.lab-result-col{border-left:1px solid rgba(255,255,255,.09);padding-left:clamp(14px,2vw,20px)}
.lab-result-col>span{color:rgba(255,255,255,.5);font-size:.68rem;font-weight:820;letter-spacing:.1em;text-transform:uppercase}
.lab-result-col p{margin:0;color:rgba(255,255,255,.8);font-size:.88rem;line-height:1.56}
.lab-audit-code{display:inline;border:1px solid rgba(255,255,255,.12);border-radius:4px;padding:1px 6px;color:rgba(255,255,255,.66);background:rgba(255,255,255,.04);font-family:var(--font-mono);font-size:.78rem}
.lab-note{color:rgba(255,255,255,.42)!important;font-size:.78rem!important;font-style:italic}
.lab-advanced{margin-top:4px;border-top:1px solid rgba(255,255,255,.09);padding-top:4px}
.lab-advanced-toggle{display:flex;align-items:center;justify-content:space-between;width:100%;padding:12px 0;color:rgba(255,255,255,.44);background:transparent;border:0;cursor:pointer;font-size:.72rem;font-weight:780;letter-spacing:.08em;text-align:left;text-transform:uppercase;transition:color 150ms ease}
.lab-advanced-toggle:hover{color:#fff}
.lab-advanced-grid{padding-bottom:8px}
.lab-coming-soon{width:max-content;display:inline-flex;align-items:center;border:1px solid rgba(234,179,8,.32);border-radius:999px;padding:2px 7px;color:#fde68a;background:rgba(234,179,8,.1);font-size:.64rem;font-weight:780;font-style:normal;letter-spacing:.06em;text-transform:uppercase}
.lab-proves-strip{padding:clamp(40px,7vw,80px) 0;margin-top:clamp(40px,7vw,72px);border-top:1px solid rgba(255,255,255,.1)}
.lab-proves-strip>h2{margin:0 0 clamp(20px,3vw,32px);color:#fff;font-size:clamp(1.6rem,2.6vw,2.6rem)}
.lab-proves-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;overflow:hidden;border:1px solid rgba(255,255,255,.1);border-radius:14px;background:rgba(255,255,255,.1)}
.lab-proves-card{min-height:160px;display:grid;align-content:start;gap:12px;padding:clamp(18px,2.5vw,28px);background:linear-gradient(180deg,rgba(255,255,255,.04),transparent 180px),rgba(10,10,10,.64)}
.lab-proves-card strong{display:block;color:#fff;font-size:1.05rem}
.lab-proves-card p{margin:0;color:rgba(255,255,255,.56);font-size:.88rem;line-height:1.55}
@media(max-width:860px){.lab-decision-columns{grid-template-columns:1fr}.lab-decision-col{border-right:0;border-bottom:1px solid rgba(255,255,255,.09)}.lab-decision-col:last-child{border-bottom:0}.lab-proves-grid{grid-template-columns:1fr}.lab-result-row{grid-template-columns:1fr}.lab-result-col+.lab-result-col{border-left:0;border-top:1px solid rgba(255,255,255,.09);padding-left:0}}
html[data-theme="light"] .lab-agent-role{color:rgba(0,0,0,.54)}
html[data-theme="light"] .lab-decision-columns{border-color:rgba(0,0,0,.10)}
html[data-theme="light"] .lab-decision-col{border-right-color:rgba(0,0,0,.09)}
html[data-theme="light"] .lab-decision-col>span{color:rgba(0,0,0,.50)}
html[data-theme="light"] .lab-request-fields dt{color:rgba(0,0,0,.42)}
html[data-theme="light"] .lab-request-fields dd{color:rgba(0,0,0,.84)}
html[data-theme="light"] .lab-passport-rule{color:rgba(0,0,0,.88)}
html[data-theme="light"] .lab-passport-detail{color:rgba(0,0,0,.56)}
html[data-theme="light"] .lab-verdict-headline{color:rgba(0,0,0,.88)}
html[data-theme="light"] .lab-verdict-sub{color:rgba(0,0,0,.56)}
html[data-theme="light"] .lab-result-row{border-top-color:rgba(0,0,0,.10)}
html[data-theme="light"] .lab-result-col+.lab-result-col{border-left-color:rgba(0,0,0,.09)}
html[data-theme="light"] .lab-result-col>span{color:rgba(0,0,0,.50)}
html[data-theme="light"] .lab-result-col p{color:rgba(0,0,0,.76)}
html[data-theme="light"] .lab-audit-code{border-color:rgba(0,0,0,.12);color:rgba(0,0,0,.58);background:rgba(0,0,0,.04)}
html[data-theme="light"] .lab-note{color:rgba(0,0,0,.42)!important}
html[data-theme="light"] .lab-advanced{border-top-color:rgba(0,0,0,.09)}
html[data-theme="light"] .lab-advanced-toggle{color:rgba(0,0,0,.44)}
html[data-theme="light"] .lab-advanced-toggle:hover{color:rgba(0,0,0,.88)}
html[data-theme="light"] .lab-coming-soon{border-color:rgba(180,130,0,.32);color:rgba(110,72,0,.88);background:rgba(234,179,8,.08)}
html[data-theme="light"] .lab-proves-strip{border-top-color:rgba(0,0,0,.10)}
html[data-theme="light"] .lab-proves-strip>h2{color:rgba(0,0,0,.88)}
html[data-theme="light"] .lab-proves-grid{border-color:rgba(0,0,0,.10);background:rgba(0,0,0,.10)}
html[data-theme="light"] .lab-proves-card{background:linear-gradient(180deg,rgba(0,0,0,.02),transparent 180px),#f5f5f6}
html[data-theme="light"] .lab-proves-card strong{color:rgba(0,0,0,.88)}
html[data-theme="light"] .lab-proves-card p{color:rgba(0,0,0,.54)}
@media(max-width:860px){html[data-theme="light"] .lab-decision-col{border-bottom-color:rgba(0,0,0,.09)} html[data-theme="light"] .lab-result-col+.lab-result-col{border-top-color:rgba(0,0,0,.09)}}
`;

type Decision = "allowed" | "denied" | "needs_approval";

type DemoAction = {
  id: string;
  isPrimary: boolean;
  label: string;
  agentRole: string;
  actionDescription: string;
  action: string;
  vendor: string;
  resource: string;
  amount?: number;
  route?: string;
  passportRule: string;
  passportDetail: string;
  decision: Decision;
  decisionHeadline: string;
  decisionSub: string;
  executed: boolean;
  auditEvent: string;
  auditSummary: string;
  note?: string;
  isPreview?: boolean;
};

const actions: DemoAction[] = [
  {
    id: "allowed-read",
    isPrimary: true,
    label: "Allowed web browse",
    agentRole: "Research Agent",
    actionDescription: "Reads a public documentation page",
    action: "browse_web",
    vendor: "web",
    resource: "web",
    route: "/docs/getting-started",
    passportRule: "allow browse_web on web",
    passportDetail: "The active permission explicitly allows public web browsing. No checkout, form submit, or credentialed request is in scope.",
    decision: "allowed",
    decisionHeadline: "Allowed within scope",
    decisionSub: "The read-only tool can run.",
    executed: true,
    auditEvent: "verification.allowed",
    auditSummary: "Allowed decision logged before execution."
  },
  {
    id: "over-limit-purchase",
    isPrimary: true,
    label: "Denied purchase over limit",
    agentRole: "Shopping Agent",
    actionDescription: "Attempts a $742 purchase with a $25 limit",
    action: "purchase",
    vendor: "shop.example",
    resource: "shop.example",
    amount: 742,
    passportRule: "allow purchase on shop.example up to $25",
    passportDetail: "A purchase permission exists, but the requested amount exceeds the maxAmount constraint.",
    decision: "denied",
    decisionHeadline: "Blocked before execution",
    decisionSub: "The checkout tool never runs.",
    executed: false,
    auditEvent: "verification.denied",
    auditSummary: "Amount-limit denial logged."
  },
  {
    id: "blocked-action",
    isPrimary: true,
    label: "Denied blocked action",
    agentRole: "Email Assistant",
    actionDescription: "Tries to send an email from a read-only mailbox permission",
    action: "send_email",
    vendor: "gmail.com",
    resource: "gmail.com",
    passportRule: "allow read_email; blockedActions includes send_email",
    passportDetail: "The active permission allows reading Gmail labels and summaries, but send_email is explicitly blocked.",
    decision: "denied",
    decisionHeadline: "Blocked action wins",
    decisionSub: "Blocked actions override allows for the same agent.",
    executed: false,
    auditEvent: "verification.denied",
    auditSummary: "Denied before the email executor receives the request."
  },
  {
    id: "missing-permission",
    isPrimary: true,
    label: "Denied missing permission",
    agentRole: "Coding Agent",
    actionDescription: "Attempts a production deploy with no deploy permission",
    action: "deploy_production",
    vendor: "github.com",
    resource: "production",
    passportRule: "active scope: github_issue_read only",
    passportDetail: "The passport allows GitHub issue reads. No active permission covers production deploys.",
    decision: "denied",
    decisionHeadline: "No permission matched",
    decisionSub: "The deploy command never runs.",
    executed: false,
    auditEvent: "verification.denied",
    auditSummary: "Missing-permission denial logged with a request ID."
  },
  {
    id: "approval-purchase",
    isPrimary: false,
    label: "Approval-required action",
    agentRole: "Shopping Agent",
    actionDescription: "Requests a $24 SaaS subscription purchase",
    action: "purchase",
    vendor: "shop.example",
    resource: "shop.example",
    amount: 24,
    passportRule: "purchase under $25 requires approval",
    passportDetail: "Amount is within the $25 limit, but the permission requires explicit approval before execution.",
    decision: "needs_approval",
    decisionHeadline: "Waiting for approval",
    decisionSub: "No action runs until the user confirms.",
    executed: false,
    auditEvent: "verification.denied",
    auditSummary: "Approval-required decisions are not executed."
  },
  {
    id: "missing-resource",
    isPrimary: false,
    label: "Denied missing resource",
    agentRole: "Calendar Agent",
    actionDescription: "Requests calendar access without passing the scoped resource",
    action: "read_calendar",
    vendor: "(missing)",
    resource: "(missing)",
    passportRule: "allow read_calendar on google-calendar",
    passportDetail: "The permission is constrained to google-calendar. Missing vendor/resource input does not bypass that constraint.",
    decision: "denied",
    decisionHeadline: "Blocked before execution",
    decisionSub: "The calendar reader does not run.",
    executed: false,
    auditEvent: "verification.denied",
    auditSummary: "Denied because constrained input was missing."
  },
  {
    id: "manual-guidance",
    isPrimary: false,
    label: "Manual passport guidance",
    agentRole: "Existing Assistant",
    actionDescription: "User shares a manual passport with an assistant",
    action: "summarize_page",
    vendor: "assistant",
    resource: "web",
    route: "/pricing",
    passportRule: "manual passport allows public summaries",
    passportDetail: "Manual passports guide assistants that do not integrate with BehalfID directly. No automatic enforcement occurs.",
    decision: "needs_approval",
    decisionHeadline: "Guidance only",
    decisionSub: "No automatic enforcement unless the assistant calls BehalfID before acting.",
    executed: false,
    auditEvent: "manual.guidance_shown",
    auditSummary: "Manual guidance only. No enforcement boundary active.",
    note: "Manual mode is best-effort guidance, not automatic enforcement."
  }
];

const proves = [
  { title: "Prevents unsafe actions", body: "Tools do not run unless the agent has permission." },
  { title: "Preserves useful automation", body: "Safe actions can proceed without constant user interruption." },
  { title: "Creates an audit trail", body: "Every allowed, blocked, or approval-required action is recorded." }
];

function decisionLabel(decision: Decision) {
  if (decision === "denied") return "Blocked";
  if (decision === "needs_approval") return "Needs approval";
  return "Allowed";
}

function requestFields(action: DemoAction): Array<[string, string]> {
  const fields: Array<[string, string]> = [
    ["agent", action.agentRole],
    ["action", action.action],
    ["vendor", action.vendor],
    ["resource", action.resource]
  ];
  if (action.route) fields.push(["route", action.route]);
  if (action.amount != null) fields.push(["amount", `$${action.amount}`]);
  return fields;
}

export function SandboxClient() {
  const [activeActionId, setActiveActionId] = useState(actions[0].id);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [running, setRunning] = useState(false);
  const activeAction = actions.find((a) => a.id === activeActionId) ?? actions[0];

  const primaryActions = actions.filter((a) => a.isPrimary);
  const advancedActions = actions.filter((a) => !a.isPrimary);

  const runTrace = async () => {
    setRunning(true);
    await new Promise((resolve) => setTimeout(resolve, 260));
    setRunning(false);
  };

  return (
    <>
      <style>{LAB_STYLES}</style>
      <div className="sandbox-page sandbox-simplified">
        <section className="sandbox-header sandbox-hero">
          <div>
            <p className="section-kicker">Decision Lab</p>
            <h1>See BehalfID stop unsafe AI actions before they run.</h1>
            <p className="sandbox-lede">
              Choose an AI action, run it through a permission passport, and see whether
              BehalfID allows it, blocks it, or pauses for human approval.
            </p>
          </div>
        </section>

        <section className="sandbox-focus" aria-label="Simulated BehalfID decision">
          <section
            className={`decision-console sandbox-trace sandbox-trace--${activeAction.decision}`}
            aria-live="polite"
          >
            <div className="sandbox-trace__header">
              <div>
                <span className="lab-agent-role">{activeAction.agentRole}</span>
                <h2>{activeAction.actionDescription}</h2>
              </div>
              <button
                className="sandbox-action__btn"
                disabled={running}
                onClick={runTrace}
                type="button"
              >
                {running ? "Checking..." : "Run scenario"}
              </button>
            </div>

            <div className="lab-decision-columns">
              <div className="lab-decision-col">
                <span>Agent request</span>
                <dl className="lab-request-fields">
                  {requestFields(activeAction).map(([key, value]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div className="lab-decision-col">
                <span>Matching rule</span>
                <strong className="lab-passport-rule">{activeAction.passportRule}</strong>
                <p className="lab-passport-detail">{activeAction.passportDetail}</p>
              </div>

              <div className="lab-decision-col">
                <span>Decision</span>
                <em className={`lab-verdict lab-verdict--${activeAction.decision}`}>
                  {decisionLabel(activeAction.decision)}
                </em>
                <p className="lab-verdict-headline">{activeAction.decisionHeadline}</p>
                <p className="lab-verdict-sub">{activeAction.decisionSub}</p>
              </div>
            </div>

            <div className="lab-result-row">
              <div className="lab-result-col">
                <span>Execution</span>
                <p>{activeAction.executed ? "Tool ran." : "Tool did not run."}</p>
              </div>
              <div className="lab-result-col">
                <span>Audit log</span>
                <p>
                  {activeAction.auditSummary}{" "}
                  <code className="lab-audit-code">{activeAction.auditEvent}</code>
                </p>
                {activeAction.note ? <p className="lab-note">{activeAction.note}</p> : null}
              </div>
            </div>
          </section>

          <aside className="action-switcher" aria-label="Scenario selector">
            <div className="sandbox-panel-heading">
              <h2>Choose a scenario</h2>
            </div>

            <div className="sandbox-action-grid">
              {primaryActions.map((action) => (
                <div className="sandbox-action-item" key={action.id}>
                  <button
                    className={[
                      "sandbox-action-card",
                      activeAction.id === action.id ? "sandbox-action-card--active" : "",
                      `sandbox-action-card--${action.decision}`
                    ].filter(Boolean).join(" ")}
                    onClick={() => setActiveActionId(action.id)}
                    type="button"
                  >
                    <strong>{action.label}</strong>
                    <small>{action.agentRole}</small>
                    <em>{decisionLabel(action.decision)}</em>
                  </button>
                </div>
              ))}
            </div>

            <div className="lab-advanced">
              <button
                className="lab-advanced-toggle"
                onClick={() => setShowAdvanced(!showAdvanced)}
                type="button"
                aria-expanded={showAdvanced}
              >
                <span>Advanced examples</span>
                <span aria-hidden="true">{showAdvanced ? "↑" : "↓"}</span>
              </button>
              {showAdvanced && (
                <div className="sandbox-action-grid lab-advanced-grid">
                  {advancedActions.map((action) => (
                    <div className="sandbox-action-item" key={action.id}>
                      <button
                        className={[
                          "sandbox-action-card",
                          activeAction.id === action.id ? "sandbox-action-card--active" : "",
                          `sandbox-action-card--${action.decision}`
                        ].filter(Boolean).join(" ")}
                        onClick={() => setActiveActionId(action.id)}
                        type="button"
                      >
                        {action.isPreview ? <em className="lab-coming-soon">Preview</em> : null}
                        <strong>{action.label}</strong>
                        <small>{action.agentRole}</small>
                        <em>{decisionLabel(action.decision)}</em>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </section>

        <section className="lab-proves-strip" aria-label="What this proves">
          <h2>What this proves</h2>
          <div className="lab-proves-grid">
            {proves.map((card) => (
              <div className="lab-proves-card" key={card.title}>
                <strong>{card.title}</strong>
                <p>{card.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="sandbox-ctas">
          <h2>Add the decision point.</h2>
          <div className="hero__actions">
            <SplitCTAButton leftLabel="Build" leftHref="/signup" rightLabel="Log In" rightHref="/login" />
            <ButtonLink href="/docs/quickstart">Read quickstart</ButtonLink>
            <ButtonLink href="/docs/action-gateway">Action Gateway docs</ButtonLink>
          </div>
          <p className="sandbox-note">
            This sandbox is simulated. No real backend permissions, network requests, or agent actions run here.
          </p>
        </section>
      </div>
    </>
  );
}
