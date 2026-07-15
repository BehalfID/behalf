"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import styles from "@/app/home-v2/home-v2.module.css";
import { PermissionPolicyMockup } from "./PermissionPolicyDemo";
import { ApprovalWorkflowMockup } from "./ApprovalWorkflowDemo";
import { VerificationLogMockup } from "./VerificationLogDemo";
import { ManagedProfileMockup } from "./ManagedProfileDemo";

const SHOWCASE_TABS = [
  {
    id: "permissions",
    label: "Permissions",
    summary: "Scope every agent to explicit actions, resources, and production constraints.",
    Panel: PermissionPolicyMockup
  },
  {
    id: "approvals",
    label: "Approvals",
    summary: "Pause sensitive actions until someone with the right authority approves them.",
    Panel: ApprovalWorkflowMockup
  },
  {
    id: "decision-logs",
    label: "Decision logs",
    summary: "Retain the policy, reason, and outcome behind every authorization decision.",
    Panel: VerificationLogMockup
  },
  {
    id: "managed-profiles",
    label: "Managed profiles",
    summary: "Apply reusable controls to coding agents at the tool boundary.",
    Panel: ManagedProfileMockup
  }
] as const;

type ShowcaseId = (typeof SHOWCASE_TABS)[number]["id"];

export function ProductShowcase() {
  const [active, setActive] = useState<ShowcaseId>("permissions");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeTab = SHOWCASE_TABS.find((tab) => tab.id === active) ?? SHOWCASE_TABS[0];
  const ActivePanel = activeTab.Panel;

  function selectFromKeyboard(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex = index;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (index + 1) % SHOWCASE_TABS.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (index - 1 + SHOWCASE_TABS.length) % SHOWCASE_TABS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = SHOWCASE_TABS.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    setActive(SHOWCASE_TABS[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <section
      id="product-showcase"
      className={`${styles.container} ${styles.section} ${styles.showcase}`}
      aria-labelledby="product-showcase-heading"
    >
      <div className={styles.showcaseHeader}>
        <h2 id="product-showcase-heading" className={styles.h2}>
          Define authority. Enforce the decision. Preserve the evidence.
        </h2>
      </div>

      <div className={styles.showcaseTabScroller}>
        <div className={styles.showcaseTabs} role="tablist" aria-label="Product capabilities">
          {SHOWCASE_TABS.map((tab, index) => {
            const selected = tab.id === active;

            return (
              <button
                key={tab.id}
                ref={(node) => {
                  tabRefs.current[index] = node;
                }}
                id={`showcase-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`showcase-panel-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                className={`${styles.showcaseTab} ${selected ? styles.showcaseTabActive : ""}`}
                onClick={() => setActive(tab.id)}
                onKeyDown={(event) => selectFromKeyboard(event, index)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div
        id={`showcase-panel-${activeTab.id}`}
        role="tabpanel"
        aria-labelledby={`showcase-tab-${activeTab.id}`}
        tabIndex={0}
        className={styles.showcasePanel}
      >
        <p className={styles.showcaseSummary}>{activeTab.summary}</p>
        <div className={styles.showcaseMockup}>
          <ActivePanel />
        </div>
      </div>
    </section>
  );
}
