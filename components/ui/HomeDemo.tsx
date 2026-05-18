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
    id: "denied",
    label: "Purchase denied",
    request: { agent: "agent_ollie", action: "purchase", vendor: "coachella.com", amount: "$742" },
    passportRule: "active scope: browse_web only",
    outcome: "denied",
    reason: "No active purchase permission.",
    executed: false,
  },
  {
    id: "allowed",
    label: "Public read",
    request: { agent: "agent_ollie", action: "browse_web", vendor: "docs.example.com", route: "/pricing" },
    passportRule: "allows browse_web on public pages",
    outcome: "allowed",
    reason: "Active passport allows safe public web reads.",
    executed: true,
  },
  {
    id: "approval",
    label: "Needs approval",
    request: { agent: "agent_ollie", action: "purchase", vendor: "shop.example.com", amount: "$24" },
    passportRule: "purchase under $25 requires approval",
    outcome: "needs_approval",
    reason: "Amount is within limit but explicit approval is required first.",
    executed: false,
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
            role="tab"
            type="button"
            aria-selected={s.id === activeId}
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
        className={["home-demo__console", checking ? "home-demo__console--checking" : ""].filter(Boolean).join(" ")}
        aria-live="polite"
        aria-label="Decision trace"
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
          <strong className={`home-demo__verdict home-demo__verdict--${scenario.outcome}`}>
            {outcomeLabel(scenario.outcome)}
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
