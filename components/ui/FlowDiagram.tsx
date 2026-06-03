"use client";
import { useEffect, useState } from "react";

// Cycles through different agent scenarios every 4 seconds
const SCENARIOS = [
  { agent: "agent_claude_code", action: "deploy", vendor: "vercel.com", env: "production", verdict: "denied",  reason: "requires approval" },
  { agent: "agent_openai_gpt4", action: "purchase", vendor: "stripe.com", amount: "$742.00",  verdict: "denied",  reason: "exceeds $50 limit" },
  { agent: "agent_claude_code", action: "read_file", vendor: "github.com", scope: "repo",    verdict: "allowed", reason: "within scope" },
  { agent: "agent_custom_bot",  action: "send_email", vendor: "sendgrid", recipient: "all",  verdict: "denied",  reason: "blocked action" },
];

export function FlowDiagram() {
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<"request" | "check" | "verdict">("request");

  useEffect(() => {
    const seq = [
      setTimeout(() => setPhase("check"),   800),
      setTimeout(() => setPhase("verdict"), 1800),
      setTimeout(() => {
        setPhase("request");
        setIdx(i => (i + 1) % SCENARIOS.length);
      }, 3800),
    ];
    return () => seq.forEach(clearTimeout);
  }, [idx]);

  const s = SCENARIOS[idx];
  const isDenied = s.verdict === "denied";

  return (
    <div className="flow-diagram" aria-hidden="true">

      {/* Left node — Agent */}
      <div className={`flow-node flow-node--agent ${phase !== "request" ? "flow-node--sent" : ""}`}>
        <div className="flow-node__icon">
          <svg viewBox="0 0 32 32" fill="none">
            <rect x="6" y="10" width="20" height="14" rx="3" stroke="currentColor" strokeWidth="1.5"/>
            <circle cx="16" cy="6" r="3" stroke="currentColor" strokeWidth="1.5"/>
            <line x1="16" y1="9" x2="16" y2="10" stroke="currentColor" strokeWidth="1.5"/>
            <circle cx="11" cy="17" r="1.5" fill="currentColor"/>
            <circle cx="21" cy="17" r="1.5" fill="currentColor"/>
            <line x1="11" y1="21" x2="21" y2="21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
        <span className="flow-node__label">AI Agent</span>
        <code className="flow-node__sub">{s.agent}</code>
      </div>

      {/* Connector line left → center */}
      <div className="flow-connector flow-connector--left">
        <div className={`flow-connector__pulse ${phase === "request" ? "flow-connector__pulse--active" : ""}`}/>
        <div className="flow-connector__track">
          <div className={`flow-connector__ball ${phase !== "request" ? "flow-connector__ball--arrived" : ""}`}/>
        </div>
        <div className="flow-connector__label">
          <span>{s.action}</span>
          <span className="flow-connector__vendor">{s.vendor}</span>
        </div>
      </div>

      {/* Center node — BehalfID */}
      <div className={`flow-node flow-node--behalf ${phase === "check" ? "flow-node--checking" : ""} ${phase === "verdict" ? (isDenied ? "flow-node--denied" : "flow-node--allowed") : ""}`}>
        <div className="flow-node__icon flow-node__icon--shield">
          <svg viewBox="0 0 32 32" fill="none">
            <path d="M16 3L5 8v8c0 6.08 4.72 11.76 11 13 6.28-1.24 11-6.92 11-13V8L16 3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
            {phase === "verdict" && !isDenied && (
              <path d="M10 16l4 4 8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flow-check"/>
            )}
            {phase === "verdict" && isDenied && (
              <>
                <line x1="11" y1="11" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="flow-x"/>
                <line x1="21" y1="11" x2="11" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="flow-x"/>
              </>
            )}
          </svg>
        </div>
        <span className="flow-node__label">BehalfID</span>
        <span className="flow-node__sub flow-node__sub--state">
          {phase === "request" && "waiting"}
          {phase === "check" && "checking…"}
          {phase === "verdict" && s.reason}
        </span>
      </div>

      {/* Connector line center → right */}
      <div className={`flow-connector flow-connector--right ${isDenied && phase === "verdict" ? "flow-connector--blocked" : ""}`}>
        <div className="flow-connector__track">
          <div className={`flow-connector__ball flow-connector__ball--right ${phase === "verdict" && !isDenied ? "flow-connector__ball--arrived" : ""} ${phase === "verdict" && isDenied ? "flow-connector__ball--blocked" : ""}`}/>
        </div>
        <div className="flow-connector__block-mark" style={{ opacity: isDenied && phase === "verdict" ? 1 : 0 }}>
          <svg viewBox="0 0 18 18" fill="none" width="18" height="18">
            <circle cx="9" cy="9" r="8" stroke="rgba(239,68,68,0.8)" strokeWidth="1.5"/>
            <line x1="4" y1="9" x2="14" y2="9" stroke="rgba(239,68,68,0.8)" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>
      </div>

      {/* Right node — Executor / Result */}
      <div className={`flow-node flow-node--executor ${phase === "verdict" && !isDenied ? "flow-node--executed" : ""} ${phase === "verdict" && isDenied ? "flow-node--blocked" : ""}`}>
        <div className="flow-node__icon">
          {isDenied ? (
            <svg viewBox="0 0 32 32" fill="none">
              <rect x="4" y="4" width="24" height="24" rx="4" stroke="currentColor" strokeWidth="1.5"/>
              <line x1="10" y1="16" x2="22" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          ) : (
            <svg viewBox="0 0 32 32" fill="none">
              <rect x="4" y="4" width="24" height="24" rx="4" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M11 16l4 4 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>
        <span className="flow-node__label">Executor</span>
        <code className={`flow-node__verdict ${isDenied ? "flow-node__verdict--deny" : "flow-node__verdict--allow"}`}>
          {phase === "verdict" ? s.verdict : "—"}
        </code>
      </div>

    </div>
  );
}
