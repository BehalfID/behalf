"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, ButtonLink, EmptyState, PageHeader, Tabs } from "@/components/ui";
import { useDashboardApi, useDashboardPaths } from "@/components/workspace/WorkspaceProvider";
import { AgentActivity } from "./AgentActivity";
import { AgentIntegrations } from "./AgentIntegrations";
import { AgentOverview } from "./AgentOverview";
import { AgentPermissions } from "./AgentPermissions";
import { formatAgentDate, formatAgentProvider } from "./format";
import type { AgentDetailResponse, AgentDetailSection } from "./types";

const SECTION_LABELS: Record<AgentDetailSection, string> = {
  overview: "Overview",
  permissions: "Permissions",
  integrations: "Integrations",
  activity: "Activity"
};

export function AgentDetailShell({
  agentId,
  section
}: {
  agentId: string;
  section: AgentDetailSection;
}) {
  const { apiJson } = useDashboardApi();
  const { href } = useDashboardPaths();
  const [detail, setDetail] = useState<AgentDetailResponse | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const reload = useCallback(async () => {
    setError("");
    try {
      setDetail(await apiJson<AgentDetailResponse>(`/api/dashboard/agents/${agentId}`));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Agent details could not be loaded.");
    }
  }, [agentId, apiJson]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await apiJson<AgentDetailResponse>(`/api/dashboard/agents/${agentId}`);
        if (!cancelled) setDetail(result);
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : "Agent details could not be loaded.");
        }
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [agentId, apiJson]);

  const basePath = href(`/dashboard/agents/${agentId}`);
  const tabs = (Object.keys(SECTION_LABELS) as AgentDetailSection[]).map((item) => ({
    label: SECTION_LABELS[item],
    href: item === "overview" ? basePath : `${basePath}/${item}`,
    active: section === item
  }));

  const copyAgentId = async () => {
    await navigator.clipboard.writeText(agentId);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const sectionAction = section === "overview"
    ? <ButtonLink href="#agent-profile">Edit profile</ButtonLink>
    : section === "permissions"
      ? <ButtonLink href="#permission-templates-title">Review templates</ButtonLink>
      : section === "integrations"
        ? <ButtonLink href="#credential-management">Credential settings</ButtonLink>
        : <ButtonLink href={href(`/dashboard/logs?agentId=${encodeURIComponent(agentId)}`)}>All audit logs</ButtonLink>;

  if (error && !detail) {
    return <EmptyState className="dashboard-empty"><p role="alert">{error}</p><Button onClick={() => void reload()} type="button">Try again</Button></EmptyState>;
  }

  if (!detail) {
    return <EmptyState className="dashboard-empty" role="status">Loading agent details…</EmptyState>;
  }

  const { agent, permissions, workspaceAuthority, securityPosture } = detail;

  return (
    <div className="agent-detail-shell">
      <PageHeader
        action={sectionAction}
        className="dashboard-header agent-detail-page-header"
        description={agent.description || "Identity, enforcement policy, integrations, and audit activity."}
        eyebrow={SECTION_LABELS[section]}
        title={agent.name}
      />
      <section className="agent-detail-header" aria-label="Agent summary">
        <div className="agent-detail-header__badges">
          <Badge>{agent.status === "active" ? "Active" : "Disabled"}</Badge>
          <Badge>{formatAgentProvider(agent.provider)}</Badge>
          <Badge>{formatAgentProvider(agent.connectionStatus)}</Badge>
        </div>
        <dl>
          <div><dt>Last used</dt><dd>{formatAgentDate(agent.lastUsedAt)}</dd></div>
          <div className="agent-detail-header__id">
            <dt>Agent ID</dt>
            <dd><code>{agent.agentId}</code><Button onClick={() => void copyAgentId()} type="button">{copied ? "Copied" : "Copy"}</Button></dd>
          </div>
        </dl>
      </section>
      <Tabs items={tabs} />
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <main className="agent-detail-content">
        {section === "overview" ? <AgentOverview agent={agent} posture={securityPosture} reload={reload} /> : null}
        {section === "permissions" ? (
          <AgentPermissions agentId={agentId} permissions={permissions} reload={reload} workspaceAuthority={workspaceAuthority} />
        ) : null}
        {section === "integrations" ? <AgentIntegrations agent={agent} permissions={permissions} reload={reload} /> : null}
        {section === "activity" ? <AgentActivity agentId={agentId} /> : null}
      </main>
    </div>
  );
}
