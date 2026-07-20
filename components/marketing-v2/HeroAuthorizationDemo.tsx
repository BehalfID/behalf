"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { ButtonLink, Card, Tab, TabList } from "@/components/ui";
import { ContinueWithGoogle } from "@/components/auth/ContinueWithGoogle";
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

export function HeroAuthorizationDemo({ googleEnabled = false }: { googleEnabled?: boolean }) {
  const [active, setActive] = useState<DecisionState>("approval");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const scenario = HERO_SCENARIOS.find((s) => s.state === active) ?? HERO_SCENARIOS[0];

  const decisionClass =
    active === "allowed" ? styles.decisionAllow : active === "denied" ? styles.decisionDeny : styles.decisionWarn;

  function selectFromKeyboard(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (index + 1) % HERO_SCENARIOS.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (index - 1 + HERO_SCENARIOS.length) % HERO_SCENARIOS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = HERO_SCENARIOS.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    setActive(HERO_SCENARIOS[nextIndex].state);
    tabRefs.current[nextIndex]?.focus();
  }

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
            <ButtonLink href="/signup" size="large" variant="primary">
              Start securing agents
              <ArrowRightIcon size={16} />
            </ButtonLink>
            {googleEnabled ? (
              <ContinueWithGoogle className="auth-google-button--compact" mode="signup" size="large" variant="outline" />
            ) : (
              <ButtonLink href="/docs/concepts" size="large" variant="outline">
                Read the technical overview
              </ButtonLink>
            )}
          </div>

          <p className={styles.heroCredit}>
            <ShieldIcon size={18} />
            {googleEnabled
              ? "Or create an account with email — Google sign-in is available on signup and login."
              : "Fail-closed by design — agents are denied unless they are explicitly authorized."}
          </p>
        </div>

        {/* Right: interactive decision panel */}
        <Card className={styles.panel} variant="elevated">
          <div className={styles.panelBar}>
            <span className={styles.panelTitle}>
              <span className={styles.panelDot} />
              behalf · verify
            </span>
            <TabList className={styles.tabs} label="Decision outcome" unstyled>
              {HERO_SCENARIOS.map((s, index) => (
                <Tab
                  key={s.state}
                  ref={(node) => {
                    tabRefs.current[index] = node;
                  }}
                  className={`${styles.tab} ${active === s.state ? TAB_CLASS[s.state] : ""}`}
                  onClick={() => setActive(s.state)}
                  onKeyDown={(event) => selectFromKeyboard(event, index)}
                  selected={active === s.state}
                  unstyled
                >
                  {s.tabLabel}
                </Tab>
              ))}
            </TabList>
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
        </Card>
      </div>
    </section>
  );
}
