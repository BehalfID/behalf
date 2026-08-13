"use client";

import Link from "next/link";
import { OnboardingIntro } from "@/components/onboarding/OnboardingShell";
import { useDashboardPaths } from "@/components/workspace/WorkspaceProvider";
import {
  ENFORCEMENT_KIND_LABELS,
  SETUP_LOCATION_LABELS,
  getSetupPath,
  type SetupLocation,
  type SetupTarget
} from "@/lib/integrationSetup";
import { PROTECTION_PRESET_LABELS, type ProtectionPolicy } from "@/lib/protectionPolicy";
import { protectionPolicyCounts } from "@/lib/protectionPolicyPermissions";
import { READINESS_STATE_LABELS, type AgentSetupReadiness } from "@/lib/setupReadinessTypes";

type SummaryRow = {
  label: string;
  value: string;
  hint?: string;
  ok: boolean;
};

/**
 * The closing screen: what is actually set up, and what is not.
 *
 * Every row is read from server-derived readiness or from the policy the
 * customer just saved. Nothing here is a hardcoded tick.
 */
export function SetupSummaryStep({
  target,
  location,
  policy,
  readiness,
  agentId
}: {
  target: SetupTarget;
  location: SetupLocation;
  policy: ProtectionPolicy;
  readiness: AgentSetupReadiness | null;
  agentId?: string;
}) {
  const { href } = useDashboardPaths();
  const path = getSetupPath(target);
  const counts = protectionPolicyCounts(policy);

  const rows: SummaryRow[] = [
    {
      label: "Agent",
      value: readiness?.agentName ?? path.label,
      hint: `${path.label} · ${SETUP_LOCATION_LABELS[location]}`,
      ok: readiness?.agentReady.ok ?? true
    },
    {
      label: "Enforcement",
      value: ENFORCEMENT_KIND_LABELS[path.enforcement],
      hint: path.enforcementPoint,
      ok: true
    },
    {
      label: "Credential",
      value: readiness?.credential.ok ? "In use" : "Issued, not used yet",
      hint: readiness?.credential.detail,
      ok: readiness?.credential.ok ?? false
    },
    {
      label: "Policy",
      value: `${PROTECTION_PRESET_LABELS[policy.preset]} — ${counts.approve} need approval, ${counts.block} blocked`,
      hint: readiness?.policy.detail,
      ok: readiness?.policy.ok ?? false
    },
    {
      label: "Verification",
      value: readiness?.enforcement.ok ? "Live decision received" : "No decision yet",
      hint: readiness?.enforcement.detail,
      ok: readiness?.enforcement.ok ?? false
    }
  ];

  const notConfigured = rows.filter((row) => !row.ok);
  const state = readiness?.state ?? "configured";

  const nextActions: Array<{ label: string; href: string; hint: string }> = [];
  if (readiness?.approvalFlow.ok || counts.approve > 0) {
    nextActions.push({
      label: "Open your approval inbox",
      href: href("/dashboard/approvals"),
      hint: "Where actions that need you show up."
    });
  }
  nextActions.push({
    label: "See recent decisions",
    href: agentId
      ? href(`/dashboard/logs?agentId=${encodeURIComponent(agentId)}`)
      : href("/dashboard/logs"),
    hint: "Every allow, ask, and refusal, with the reason."
  });
  if (path.enforcement === "intercepting") {
    nextActions.push({
      label: "Protect CI as well",
      href: href("/dashboard/agents/new"),
      hint: "Your pipeline is a separate surface and is not covered by this setup."
    });
  } else {
    nextActions.push({
      label: "Protect a coding agent",
      href: href("/dashboard/agents/new"),
      hint: "Claude Code, Codex, or Cursor on a developer machine."
    });
  }
  nextActions.push({
    label: "Fine-tune this policy",
    href: agentId
      ? href(`/dashboard/agents/${encodeURIComponent(agentId)}/permissions`)
      : href("/dashboard/agents"),
    hint: "Every rule from setup is editable here."
  });

  return (
    <>
      <OnboardingIntro
        eyebrow="Agent setup · Done"
        title={
          state === "verified"
            ? "BehalfID is protecting this agent"
            : "Setup saved — protection starts on the first request"
        }
        description={
          state === "verified"
            ? "We have seen a real decision come back through the same path your agent uses."
            : "Everything is configured. This page will show protection as live once your agent makes its first request."
        }
      />

      <section className="connect-summary" aria-label="Your BehalfID setup">
        <div className="connect-summary__state" data-state={state}>
          {READINESS_STATE_LABELS[state]}
        </div>
        <dl className="connect-summary__list">
          {rows.map((row) => (
            <div className="connect-summary__row" data-ok={row.ok} key={row.label}>
              <dt>{row.label}</dt>
              <dd>
                <span className="connect-summary__value">
                  <span aria-hidden="true">{row.ok ? "✓" : "○"}</span>
                  {row.value}
                </span>
                {row.hint ? <span className="connect-summary__hint">{row.hint}</span> : null}
              </dd>
            </div>
          ))}
        </dl>

        {notConfigured.length ? (
          <p className="connect-summary__foot">
            Not done yet: {notConfigured.map((row) => row.label.toLowerCase()).join(", ")}.
          </p>
        ) : null}

        <p className="connect-summary__foot">
          This covers {path.label.toLowerCase()} only. Your CI, servers, and other machines are
          separate and are not protected by this setup.
        </p>
      </section>

      <section className="connect-next" aria-label="What next">
        <p className="cx-label">What next</p>
        <div className="connect-next__list">
          {nextActions.map((action) => (
            <Link className="connect-next__row" href={action.href} key={action.label}>
              <strong>{action.label}</strong>
              <span>{action.hint}</span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
