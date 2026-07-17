"use client";

import { useState, type ReactNode } from "react";
import { ButtonLink } from "@/components/ui";
import { useMode } from "@/lib/useMode";

const LAB_STYLES = `
.lab-agent-role{color:rgba(255,255,255,.54);font-size:.84rem}
.lab-decision-columns{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1.3fr) minmax(0,0.9fr);margin-bottom:clamp(24px,3.5vw,38px);border:1px solid rgba(255,255,255,.1);border-radius:12px;overflow:hidden}
.lab-decision-col{display:grid;align-content:start;gap:10px;padding:clamp(14px,2vw,20px);border-right:1px solid rgba(255,255,255,.09)}
.lab-decision-col:last-child{border-right:0}
.lab-decision-col>span{color:rgba(255,255,255,.5);font-size:.68rem;font-weight:820;letter-spacing:.1em;text-transform:uppercase}
.lab-request-fields{display:grid;gap:7px;margin:0}
.lab-request-fields div{display:grid;grid-template-columns:70px minmax(0,1fr);gap:6px}
.lab-request-fields dt{color:rgba(255,255,255,.42);font-family:var(--font-mono);font-size:.68rem;line-height:1.55}
.lab-request-fields dd{margin:0;color:rgba(255,255,255,.86);font-family:var(--font-mono);font-size:.74rem;line-height:1.55;word-break:break-all}
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
.lab-proves-strip{padding:64px 0;margin-top:48px;border-top:1px solid rgba(255,255,255,.1)}
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

type DemoResult = {
  requestId: string;
  allowed: boolean;
  approvalRequired: boolean;
  reason: string;
  risk: "low" | "medium" | "high";
  timestamp: string;
};

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
    id: "deploy-approval",
    isPrimary: true,
    label: "Production deploy — approval",
    agentRole: "Claude Code",
    actionDescription: "Attempts a production deploy",
    action: "deploy_production",
    vendor: "vercel.com",
    resource: "production",
    passportRule: "deploy_production on vercel.com requires approval",
    passportDetail: "A deploy permission exists, but production deploys pause for human approval before execution.",
    decision: "needs_approval",
    decisionHeadline: "Waiting for approval",
    decisionSub: "The deploy pauses until a human approves it.",
    executed: false,
    auditEvent: "verification.denied",
    auditSummary: "Approval-required decision logged; nothing runs yet."
  },
  {
    id: "migration-denied",
    isPrimary: true,
    label: "Database migration — denied",
    agentRole: "Cursor Agent",
    actionDescription: "Runs a migration on the production database",
    action: "db_migrate",
    vendor: "prod-postgres",
    resource: "prod-postgres",
    passportRule: "active scope: db_read on prod-postgres",
    passportDetail: "The passport allows reads on the production database. No active permission covers migrations.",
    decision: "denied",
    decisionHeadline: "No permission matched",
    decisionSub: "The migration never runs.",
    executed: false,
    auditEvent: "verification.denied",
    auditSummary: "Missing-permission denial logged with a request ID."
  },
  {
    id: "github-read-allowed",
    isPrimary: true,
    label: "GitHub issue read — allowed",
    agentRole: "Codex Agent",
    actionDescription: "Reads an issue from a repository",
    action: "github_issue_read",
    vendor: "github.com",
    resource: "github.com",
    passportRule: "allow github_issue_read on github.com",
    passportDetail: "The active permission allows read-only GitHub access. No write, push, or merge is in scope.",
    decision: "allowed",
    decisionHeadline: "Allowed within scope",
    decisionSub: "The read-only tool can run.",
    executed: true,
    auditEvent: "verification.allowed",
    auditSummary: "Allowed decision logged before execution."
  },
  {
    id: "push-main-denied",
    isPrimary: true,
    label: "Direct push to main — denied",
    agentRole: "Cursor Agent",
    actionDescription: "Attempts a direct push to the main branch",
    action: "git_push_main",
    vendor: "github.com",
    resource: "github.com",
    passportRule: "allow git_push; blockedActions includes git_push_main",
    passportDetail: "The permission allows pushing to feature branches, but direct pushes to main are explicitly blocked.",
    decision: "denied",
    decisionHeadline: "Blocked action wins",
    decisionSub: "Blocked actions override allows for the same agent.",
    executed: false,
    auditEvent: "verification.denied",
    auditSummary: "Denied before the push reaches GitHub."
  },
  {
    id: "secret-write-denied",
    isPrimary: false,
    label: "Secret file write — denied",
    agentRole: "Coding Agent",
    actionDescription: "Tries to write to .env",
    action: "write_env",
    vendor: "repo",
    resource: "repo",
    passportRule: "allow read_file; blockedActions includes write_env",
    passportDetail: "The permission allows reading files in the repo, but writes to .env, secrets, and credentials are blocked.",
    decision: "denied",
    decisionHeadline: "Blocked action wins",
    decisionSub: "Writes to secrets never run.",
    executed: false,
    auditEvent: "verification.denied",
    auditSummary: "Secret-write denial logged."
  },
  {
    id: "dependency-approval",
    isPrimary: false,
    label: "Dependency update — approval",
    agentRole: "Claude Code",
    actionDescription: "Updates project dependencies",
    action: "update_dependencies",
    vendor: "npm",
    resource: "npm",
    passportRule: "update_dependencies requires approval",
    passportDetail: "Dependency updates are allowed, but require explicit approval before they run.",
    decision: "needs_approval",
    decisionHeadline: "Waiting for approval",
    decisionSub: "No action runs until the user confirms.",
    executed: false,
    auditEvent: "verification.denied",
    auditSummary: "Approval-required decision logged."
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

export function SandboxClient({ authCta }: { authCta: ReactNode }) {
  const [activeActionId, setActiveActionId] = useState(actions[0].id);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DemoResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const { mode } = useMode();
  const isSimple = mode === "simple";
  const activeAction = actions.find((a) => a.id === activeActionId) ?? actions[0];

  const primaryActions = actions.filter((a) => a.isPrimary);
  const advancedActions = actions.filter((a) => !a.isPrimary);

  // In simple mode, if the currently selected action is advanced, switch to first primary
  const visibleActiveAction =
    isSimple && !activeAction.isPrimary
      ? (actions.find((a) => a.isPrimary) ?? activeAction)
      : activeAction;

  const realDecision: Decision | null = result
    ? result.allowed
      ? "allowed"
      : result.approvalRequired
      ? "needs_approval"
      : "denied"
    : null;

  const handleScenarioChange = (id: string) => {
    setActiveActionId(id);
    setResult(null);
    setRunError(null);
  };

  const runTrace = async () => {
    setRunning(true);
    setRunError(null);
    try {
      const response = await fetch("/api/demo/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenarioId: visibleActiveAction.id })
      });
      const data = await response.json() as Record<string, unknown>;
      if (!response.ok) {
        setRunError(typeof data.error === "string" ? data.error : "Demo check failed.");
      } else {
        setResult({
          requestId: data.requestId as string,
          allowed: data.allowed as boolean,
          approvalRequired: data.approvalRequired as boolean,
          reason: data.reason as string,
          risk: data.risk as "low" | "medium" | "high",
          timestamp: data.timestamp as string
        });
      }
    } catch {
      setRunError("Network error — please try again.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <style>{LAB_STYLES}</style>
      <div className="sandbox-page sandbox-simplified">
        <section className="sandbox-header sandbox-hero">
          <div>
            <p className="section-kicker">Decision Lab</p>
            <h1>See BehalfID gate coding-agent actions before they run.</h1>
            <p className="sandbox-lede">
              Choose a coding-agent action, run it through a permission passport, and see whether
              BehalfID allows it, blocks it, or pauses for your approval.
            </p>
          </div>
        </section>

        <section className="sandbox-focus" aria-label="BehalfID policy decision">
          <section
            className={`decision-console sandbox-trace sandbox-trace--${realDecision ?? visibleActiveAction.decision}`}
            aria-live="polite"
          >
            <div className="sandbox-trace__header">
              <div>
                <span className="lab-agent-role">{visibleActiveAction.agentRole}</span>
                <h2>{visibleActiveAction.actionDescription}</h2>
              </div>
              <button
                className="sandbox-action__btn"
                disabled={running}
                onClick={runTrace}
                type="button"
              >
                {running ? "Checking..." : result ? "Run again" : "Run scenario"}
              </button>
            </div>

            <div className="lab-decision-columns">
              <div className="lab-decision-col">
                <span>{isSimple ? "What the agent tried" : "Agent request"}</span>
                {isSimple ? (
                  <p className="lab-passport-rule" style={{ fontSize: "0.9rem" }}>
                    {visibleActiveAction.actionDescription}
                  </p>
                ) : (
                  <dl className="lab-request-fields">
                    {requestFields(visibleActiveAction).map(([key, value]) => (
                      <div key={key}>
                        <dt>{key}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>

              <div className="lab-decision-col">
                <span>{isSimple ? "What the rule says" : "Matching rule"}</span>
                <strong className="lab-passport-rule">{visibleActiveAction.passportRule}</strong>
                <p className="lab-passport-detail">{visibleActiveAction.passportDetail}</p>
              </div>

              <div className="lab-decision-col">
                <span>{isSimple ? "What happened" : "Decision"}</span>
                <em className={`lab-verdict lab-verdict--${realDecision ?? visibleActiveAction.decision}`}>
                  {isSimple
                    ? ((realDecision ?? visibleActiveAction.decision) === "allowed"       ? "Approved ✓"
                       : (realDecision ?? visibleActiveAction.decision) === "denied"      ? "Blocked ✗"
                                                                                          : "Ask me first ⚠")
                    : decisionLabel(realDecision ?? visibleActiveAction.decision)
                  }
                </em>
                <p className="lab-verdict-headline">
                  {result ? (result.allowed ? "Allowed — real policy decision" : result.approvalRequired ? "Approval required" : "Blocked — real policy decision") : visibleActiveAction.decisionHeadline}
                </p>
                <p className="lab-verdict-sub">
                  {result ? result.reason : visibleActiveAction.decisionSub}
                </p>
              </div>
            </div>

            <div className="lab-result-row">
              <div className="lab-result-col">
                <span>{isSimple ? "Did the tool run?" : "Execution"}</span>
                <p>{visibleActiveAction.executed ? "Yes — the tool ran." : "No — the tool did not run."}</p>
              </div>
              <div className="lab-result-col">
                <span>{isSimple ? "Audit record" : "Audit log"}</span>
                <p>
                  {visibleActiveAction.auditSummary}{" "}
                  {!isSimple && <code className="lab-audit-code">{visibleActiveAction.auditEvent}</code>}
                </p>
                {visibleActiveAction.note ? <p className="lab-note">{visibleActiveAction.note}</p> : null}
              </div>
            </div>

            {result && (
              <div className="lab-result-row" style={{ marginTop: 0, borderTop: "1px solid rgba(255,255,255,.06)" }}>
                <div className="lab-result-col">
                  <span>Request ID</span>
                  <p><code className="lab-audit-code">{result.requestId}</code></p>
                </div>
                <div className="lab-result-col">
                  <span>Timestamp</span>
                  <p style={{ fontFamily: "var(--font-mono)", fontSize: ".78rem" }}>
                    {new Date(result.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </p>
                </div>
              </div>
            )}

            {runError && (
              <p style={{ margin: "12px 0 0", color: "#fca5a5", fontSize: ".82rem" }}>{runError}</p>
            )}
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
                      visibleActiveAction.id === action.id ? "sandbox-action-card--active" : "",
                      `sandbox-action-card--${action.decision}`
                    ].filter(Boolean).join(" ")}
                    onClick={() => handleScenarioChange(action.id)}
                    type="button"
                  >
                    <strong>{action.label}</strong>
                    <small>{action.agentRole}</small>
                    <em>
                      {isSimple
                        ? (action.decision === "allowed"       ? "Approved ✓"
                           : action.decision === "denied"      ? "Blocked ✗"
                                                               : "Ask me first ⚠")
                        : decisionLabel(action.decision)
                      }
                    </em>
                  </button>
                </div>
              ))}
            </div>

            {/* Advanced examples — hidden in simple mode */}
            {!isSimple && (
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
                            visibleActiveAction.id === action.id ? "sandbox-action-card--active" : "",
                            `sandbox-action-card--${action.decision}`
                          ].filter(Boolean).join(" ")}
                          onClick={() => handleScenarioChange(action.id)}
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
            )}

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
            {authCta}
            <ButtonLink href="/docs/quickstart">Read quickstart</ButtonLink>
            <ButtonLink href="/docs/action-gateway">Action Gateway docs</ButtonLink>
          </div>
          <p className="sandbox-note">
            The decision above is a real policy decision — the same engine that powers production BehalfID.
            No external agent action is executed; only the permission check runs.
          </p>
        </section>
      </div>
    </>
  );
}
