"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "@/app/home-v2/home-v2.module.css";
import { HERO_SCENARIOS, type DecisionState } from "./data";
import { ShieldIcon, CheckIcon, XIcon, PauseIcon, ArrowRightIcon } from "./icons";

const TAB_CLASS: Record<DecisionState, string> = {
  allowed: styles.tabActiveAllow,
  denied: styles.tabActiveDeny,
  approval: styles.tabActiveWarn
};

function Verdict({ state, label }: { state: DecisionState; label: string }) {
  if (state === "allowed") {
    return (
      <span className={`${styles.verdict} ${styles.verdictAllow}`}>
        <span className={`${styles.verdictIcon} ${styles.verdictIconAllow}`}>
          <CheckIcon size={13} strokeWidth={2.4} />
        </span>
        {label}
      </span>
    );
  }
  if (state === "denied") {
    return (
      <span className={`${styles.verdict} ${styles.verdictDeny}`}>
        <span className={`${styles.verdictIcon} ${styles.verdictIconDeny}`}>
          <XIcon size={13} strokeWidth={2.4} />
        </span>
        {label}
      </span>
    );
  }
  return (
    <span className={`${styles.verdict} ${styles.verdictWarn}`}>
      <span className={`${styles.verdictIcon} ${styles.verdictIconWarn}`}>
        <PauseIcon size={11} strokeWidth={2.4} />
      </span>
      {label}
    </span>
  );
}

export function HeroAuthorizationDemo() {
  const [active, setActive] = useState<DecisionState>("approval");
  const scenario = HERO_SCENARIOS.find((s) => s.state === active) ?? HERO_SCENARIOS[0];

  const decisionClass =
    active === "allowed" ? styles.decisionAllow : active === "denied" ? styles.decisionDeny : styles.decisionWarn;

  return (
    <section className={`${styles.container} ${styles.hero}`}>
      <div className={styles.heroGrid}>
        {/* Left: copy */}
        <div className={styles.heroText}>
          <h1 className={styles.h1}>Control what your AI agents are allowed to do.</h1>
          <p className={styles.heroSub}>
            Give every AI agent an identity, define exactly what it may do, and require approval before sensitive
            actions execute.
          </p>

          <div className={styles.heroActions}>
            <Link href="/signup" className={styles.btnPrimary}>
              Start securing agents
              <ArrowRightIcon size={16} />
            </Link>
            <Link href="/docs/concepts" className={styles.btnSecondary}>
              Read the technical overview
            </Link>
          </div>

          <p className={styles.heroCredit}>
            <ShieldIcon size={18} />
            Fail-closed by design — agents are denied unless they are explicitly authorized.
          </p>
        </div>

        {/* Right: interactive decision panel */}
        <div className={styles.panel}>
          <div className={styles.panelBar}>
            <span className={styles.panelTitle}>
              <span className={styles.panelDot} />
              behalf · verify
            </span>
            <div className={styles.tabs} role="tablist" aria-label="Decision outcome">
              {HERO_SCENARIOS.map((s) => (
                <button
                  key={s.state}
                  role="tab"
                  aria-selected={active === s.state}
                  className={`${styles.tab} ${active === s.state ? TAB_CLASS[s.state] : ""}`}
                  onClick={() => setActive(s.state)}
                >
                  {s.tabLabel}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.panelBody}>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Agent</span>
              <code className={styles.rowVal}>{scenario.agent}</code>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Requested action</span>
              <code className={`${styles.rowVal} ${styles.rowValStrong}`}>{scenario.action}</code>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Vendor</span>
              <code className={styles.rowVal}>{scenario.vendor}</code>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Resource</span>
              <code className={styles.rowVal}>{scenario.resource}</code>
            </div>
            {scenario.amount && (
              <div className={styles.row}>
                <span className={styles.rowLabel}>Amount</span>
                <code className={`${styles.rowVal} ${styles.rowValWarn}`}>{scenario.amount}</code>
              </div>
            )}
            <div className={styles.row}>
              <span className={styles.rowLabel}>Policy matched</span>
              <code className={styles.rowVal}>{scenario.policy}</code>
            </div>
            {scenario.requiredAuthority && (
              <div className={styles.row}>
                <span className={styles.rowLabel}>Required authority</span>
                <code className={styles.rowVal}>{scenario.requiredAuthority}</code>
              </div>
            )}
          </div>

          <div className={`${styles.decision} ${decisionClass}`}>
            <span className={styles.decisionLabel} aria-hidden="true">
              DECISION
            </span>
            <Verdict state={active} label={scenario.verdict} />
          </div>

          <p className={styles.panelReason}>{scenario.reason}</p>

          <div className={styles.flowLine} aria-hidden="true">
            <span className={styles.flowNode}>Agent request</span>
            <span className={styles.flowArrow}>→</span>
            <span className={styles.flowNode}>Policy evaluation</span>
            <span className={styles.flowArrow}>→</span>
            <span className={styles.flowNode}>Allow · Deny · Approve</span>
          </div>
        </div>
      </div>
    </section>
  );
}
