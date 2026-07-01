"use client";

import { useState } from "react";
import Link from "next/link";
import { haptic } from "@/lib/haptic";

type Outcome = "allowed" | "denied" | "needs_approval";

type Scenario = {
  id: string;
  label: string;
  request: Record<string, string>;
  passportRule: string;
  outcome: Outcome;
  reason: string;
  executed: boolean;
};

const scenarios: Scenario[] = [
  {
    id: "deploy",
    label: "Production deploy",
    request: { agent: "agent_claude_code", action: "deploy", target: "vercel.com", env: "production" },
    passportRule: "production deploys require approval",
    outcome: "needs_approval",
    reason: "Production deploy paused for human approval.",
    executed: false,
  },
  {
    id: "migration",
    label: "Database migration",
    request: { agent: "agent_cursor", action: "db_migrate", target: "prod-postgres" },
    passportRule: "no migrate permission on prod-postgres",
    outcome: "denied",
    reason: "No permission to run migrations on the production database.",
    executed: false,
  },
  {
    id: "read",
    label: "GitHub read",
    request: { agent: "agent_codex", action: "read_issue", repo: "behalfid/app" },
    passportRule: "allows read on github.com",
    outcome: "allowed",
    reason: "Read-only GitHub access is within scope.",
    executed: true,
  },
];

function outcomeLabel(outcome: Outcome) {
  if (outcome === "needs_approval") return "needs approval";
  return outcome;
}

export function HomeDemo() {
  const [activeId, setActiveId] = useState(scenarios[0].id);
  const [checking, setChecking] = useState(false);

  const scenario = scenarios.find((s) => s.id === activeId) ?? scenarios[0];

  const runTrace = async () => {
    haptic("medium");
    setChecking(true);
    await new Promise((r) => setTimeout(r, 380));
    haptic("success");
    setChecking(false);
  };

  const switchScenario = (id: string) => {
    haptic("light");
    setActiveId(id);
    setChecking(false);
  };

  return (
    <section className="home-demo" aria-labelledby="demo-heading">
      <div className="home-demo__head">
        <p className="section-kicker">Interactive demo</p>
        <h2 id="demo-heading" className="home-demo__h2">See the boundary decide.</h2>
        <p className="home-demo__sub">
          Switch scenarios and run a trace. No real actions execute here.
        </p>
      </div>

      <div className="home-demo__tabs" role="tablist" aria-label="Demo scenarios">
        {scenarios.map((s) => (
          <button
            key={s.id}
            id={`demo-tab-${s.id}`}
            role="tab"
            type="button"
            aria-selected={s.id === activeId}
            aria-controls="demo-panel"
            className={[
              "home-demo__tab",
              s.id === activeId ? "home-demo__tab--active" : "",
            ].filter(Boolean).join(" ")}
            onClick={() => switchScenario(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div
        id="demo-panel"
        role="tabpanel"
        aria-labelledby={`demo-tab-${activeId}`}
        aria-live="polite"
        className={["home-demo__console", checking ? "home-demo__console--checking" : ""].filter(Boolean).join(" ")}
      >
        {/* Request panel */}
        <div className="home-demo__request">
          <span className="sv-label">ACTION REQUEST</span>
          <div className="sv-rows home-demo__rows">
            {Object.entries(scenario.request).map(([key, val]) => (
              <div key={key}>
                <span>{key}</span>
                <code>{val}</code>
              </div>
            ))}
          </div>
        </div>

        {/* Boundary connector */}
        <div className="home-demo__gateway" aria-hidden="true">
          <span className="sv-label sv-label--accent">BEHALFID</span>
          <div className="home-demo__gateway-pulse" />
          <div className="home-demo__passport-rule">
            <span className="sv-label">active rule</span>
            <code>{scenario.passportRule}</code>
          </div>
        </div>

        {/* Decision panel */}
        <div className={`home-demo__decision home-demo__decision--${scenario.outcome}`}>
          <span className="sv-label">DECISION</span>
          {/* Advanced: monospace verdict */}
          <strong className={`home-demo__verdict home-demo__verdict--${scenario.outcome}`}>
            {outcomeLabel(scenario.outcome)}
          </strong>
          {/* Simple: friendly verdict */}
          <strong className={`home-demo__verdict-simple home-demo__verdict-simple--${scenario.outcome}`}>
            {scenario.outcome === "allowed"       ? "Approved ✓" :
             scenario.outcome === "denied"        ? "Blocked ✗" :
                                                   "Ask me first ⚠"}
          </strong>
          <code className="home-demo__reason">{scenario.reason}</code>
          <div className="home-demo__exec-row">
            <span className="sv-label">executed</span>
            <code className={scenario.executed ? "home-demo__exec-true" : "sv-muted"}>
              {String(scenario.executed)}
            </code>
          </div>
        </div>
      </div>

      <div className="home-demo__foot">
        <button
          type="button"
          className="ui-button home-demo__run"
          disabled={checking}
          onClick={runTrace}
        >
          {checking ? "Checking passport…" : "Run trace"}
        </button>
        <p className="home-demo__note">
          The full sandbox has more scenarios.{" "}
          <Link href="/sandbox">Open sandbox →</Link>
        </p>
      </div>
    </section>
  );
}
