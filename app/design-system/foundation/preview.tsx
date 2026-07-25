"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import {
  Button,
  Dialog,
  Dropdown,
  DropdownItem,
  Popover,
  Tab,
  TabList,
  TabPanel,
  Toast,
  Tooltip
} from "@/components/ui";
import styles from "./page.module.css";

const PREVIEW_TABS = [
  {
    id: "policy",
    label: "Policy",
    copy: "Production changes require an Engineering Lead approval before execution."
  },
  {
    id: "activity",
    label: "Activity",
    copy: "Four verification decisions were recorded for this agent in the last hour."
  },
  {
    id: "identity",
    label: "Identity",
    copy: "The agent identity is active and bound to the production workspace."
  }
] as const;

type PreviewTab = (typeof PREVIEW_TABS)[number]["id"];

export function InteractivePreview() {
  const [activeTab, setActiveTab] = useState<PreviewTab>("policy");
  const [toastVisible, setToastVisible] = useState(true);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const active = PREVIEW_TABS.find((tab) => tab.id === activeTab) ?? PREVIEW_TABS[0];

  function selectTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex = index;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (index + 1) % PREVIEW_TABS.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (index - 1 + PREVIEW_TABS.length) % PREVIEW_TABS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = PREVIEW_TABS.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    setActiveTab(PREVIEW_TABS[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <div className={styles.interactiveGrid}>
      <div className={styles.specimen}>
        <p className={styles.specimenLabel}>Tabs</p>
        <TabList className={styles.previewTabs} label="Agent record views">
          {PREVIEW_TABS.map((tab, index) => {
            const selected = tab.id === activeTab;
            return (
              <Tab
                aria-controls={`foundation-tabpanel-${tab.id}`}
                id={`foundation-tab-${tab.id}`}
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(event) => selectTab(event, index)}
                ref={(node) => {
                  tabRefs.current[index] = node;
                }}
                selected={selected}
              >
                {tab.label}
              </Tab>
            );
          })}
        </TabList>
        <TabPanel
          aria-labelledby={`foundation-tab-${active.id}`}
          className={styles.tabPanel}
          id={`foundation-tabpanel-${active.id}`}
        >
          <strong>{active.label}</strong>
          <p>{active.copy}</p>
        </TabPanel>
      </div>

      <div className={styles.specimen}>
        <p className={styles.specimenLabel}>Overlays</p>
        <div className={styles.controlRow}>
          <Dialog
            description="Review the exact action and policy match before granting a single-use approval."
            footer={(close) => (
              <>
                <Button onClick={close} type="button" variant="outline">Cancel</Button>
                <Button onClick={close} type="button" variant="primary">Approve once</Button>
              </>
            )}
            title="Approve production deploy"
            trigger={(open) => (
              <Button onClick={open} type="button" variant="primary">Open dialog</Button>
            )}
          >
            <dl className={styles.dialogMetadata}>
              <div><dt>Agent</dt><dd>deploy-agent-prod</dd></div>
              <div><dt>Action</dt><dd>vercel.deployments.create</dd></div>
              <div><dt>Policy</dt><dd>production-change-control</dd></div>
            </dl>
          </Dialog>

          <Dropdown label="Actions">
            <DropdownItem>View agent</DropdownItem>
            <DropdownItem>Rotate credential</DropdownItem>
            <DropdownItem>Disable agent</DropdownItem>
          </Dropdown>

          <Popover label="Policy note">
            Approval grants are bound to one action fingerprint and expire after use.
          </Popover>

          <Tooltip content="Copy the immutable request identifier">
            <Button aria-label="Copy request identifier" size="icon" type="button" variant="outline">
              <span aria-hidden="true">#</span>
            </Button>
          </Tooltip>
        </div>
      </div>

      <div className={`${styles.specimen} ${styles.toastSpecimen}`}>
        <p className={styles.specimenLabel}>Toast</p>
        {toastVisible ? (
          <Toast
            description="The production policy is now active for 12 agents."
            onDismiss={() => setToastVisible(false)}
            title="Policy published"
            tone="success"
          />
        ) : (
          <Button onClick={() => setToastVisible(true)} type="button" variant="outline">
            Show notification
          </Button>
        )}
      </div>
    </div>
  );
}
