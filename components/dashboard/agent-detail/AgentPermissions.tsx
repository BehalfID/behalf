"use client";

import { useMemo, useState } from "react";
import { Button, EmptyState } from "@/components/ui";
import { useDashboardApi } from "@/components/workspace/WorkspaceProvider";
import { POLICY_CATEGORY_LABELS, POLICY_TEMPLATES } from "@/lib/policyTemplates";
import { PermissionDetails } from "./PermissionDetails";
import { PermissionEditor, type PermissionEditorMode } from "./PermissionEditor";
import {
  EMPTY_PERMISSION_DRAFT,
  permissionDraftsFromTemplate,
  permissionToDraft
} from "./permissionDrafts";
import type {
  AgentPermission,
  PermissionDraft,
  WorkspaceAuthority
} from "./types";

type EditorState = {
  mode: PermissionEditorMode;
  permission?: AgentPermission;
  drafts: PermissionDraft[];
};

export function AgentPermissions({
  agentId,
  permissions,
  workspaceAuthority,
  reload
}: {
  agentId: string;
  permissions: AgentPermission[];
  workspaceAuthority?: WorkspaceAuthority | null;
  reload: () => Promise<void>;
}) {
  const { apiJson } = useDashboardApi();
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "revoked">("active");
  const [approvalFilter, setApprovalFilter] = useState<"all" | "required" | "not_required">("all");
  const [actionFilter, setActionFilter] = useState("");
  const [resourceFilter, setResourceFilter] = useState("");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [error, setError] = useState("");

  const filtered = useMemo(() => permissions.filter((permission) => {
    if (statusFilter !== "all" && permission.status !== statusFilter) return false;
    if (approvalFilter === "required" && !permission.requiresApproval) return false;
    if (approvalFilter === "not_required" && permission.requiresApproval) return false;
    if (actionFilter && !permission.action.toLowerCase().includes(actionFilter.toLowerCase())) return false;
    if (resourceFilter && !(permission.resource ?? "").toLowerCase().includes(resourceFilter.toLowerCase())) return false;
    return true;
  }), [permissions, statusFilter, approvalFilter, actionFilter, resourceFilter]);

  const openCreate = () => setEditor({
    mode: "create",
    drafts: [{ ...EMPTY_PERMISSION_DRAFT, constraints: {} }]
  });

  const openReplace = (permission: AgentPermission) => {
    if (permission.status !== "active") return;
    setEditor({
      mode: "replace",
      permission,
      drafts: [permissionToDraft(permission)]
    });
  };

  const openTemplate = (templateId: string) => {
    const template = POLICY_TEMPLATES.find((item) => item.id === templateId);
    if (!template) return;
    setEditor({
      mode: "template",
      drafts: permissionDraftsFromTemplate(template)
    });
  };

  const revoke = async (permission: AgentPermission) => {
    if (!window.confirm(`Revoke ${permission.permissionId}? It will remain visible in audit history.`)) return;
    setError("");
    try {
      await apiJson(`/api/dashboard/agents/${agentId}/permissions/${permission.permissionId}/revoke`, { method: "POST" });
      await reload();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Permission revocation failed.");
    }
  };

  return (
    <div className="agent-section-stack">
      <section className="dashboard-panel agent-permissions-toolbar">
        <div className="dashboard-section-header">
          <div>
            <h2>Permissions workspace</h2>
            <p>Inspect effective policy details, create reviewed drafts, or safely replace an active permission.</p>
          </div>
          <Button
            disabled={!workspaceAuthority || workspaceAuthority.authorityLevel <= 10}
            onClick={openCreate}
            variant="primary"
            type="button"
          >
            Add permission
          </Button>
        </div>
        <div className="agent-permission-filters" aria-label="Permission filters">
          <label>
            <span>Status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
              <option value="active">Active</option>
              <option value="revoked">Revoked</option>
              <option value="all">All</option>
            </select>
          </label>
          <label>
            <span>Approval</span>
            <select value={approvalFilter} onChange={(event) => setApprovalFilter(event.target.value as typeof approvalFilter)}>
              <option value="all">All</option>
              <option value="required">Approval required</option>
              <option value="not_required">No approval required</option>
            </select>
          </label>
          <label>
            <span>Action</span>
            <input value={actionFilter} onChange={(event) => setActionFilter(event.target.value)} placeholder="execute_command" />
          </label>
          <label>
            <span>Resource</span>
            <input value={resourceFilter} onChange={(event) => setResourceFilter(event.target.value)} placeholder="shell" />
          </label>
        </div>
      </section>

      {error ? <p className="form-error" role="alert">{error}</p> : null}

      <section aria-labelledby="permission-list-title">
        <div className="agent-section-heading">
          <div>
            <h2 id="permission-list-title">Current permissions</h2>
            <p>{filtered.length} of {permissions.length} permissions shown</p>
          </div>
        </div>
        <div className="permission-details-list">
          {filtered.map((permission) => (
            <PermissionDetails
              actions={permission.status === "active" ? (
                <>
                  <Button onClick={() => openReplace(permission)} type="button">Replace permission</Button>
                  <Button onClick={() => void revoke(permission)} type="button" variant="danger">Revoke</Button>
                </>
              ) : null}
              key={permission.permissionId}
              permission={permission}
            />
          ))}
        </div>
        {!filtered.length ? (
          <EmptyState className="dashboard-empty">
            {permissions.length ? "No permissions match these filters." : "No permissions yet. Create a reviewed permission draft to get started."}
          </EmptyState>
        ) : null}
      </section>

      <section className="dashboard-panel" aria-labelledby="permission-templates-title">
        <div className="dashboard-section-header">
          <div>
            <h2 id="permission-templates-title">Policy templates</h2>
            <p>Templates populate drafts only. Review every permission, authority requirement, constraint, and overlap before confirming.</p>
          </div>
        </div>
        <div className="permission-template-grid permission-template-grid--agent-detail">
          {POLICY_TEMPLATES.map((template) => (
            <button className="permission-template" key={template.id} onClick={() => openTemplate(template.id)} type="button">
              <strong>{template.label}</strong>
              <span>{template.tagline}</span>
              <small>{POLICY_CATEGORY_LABELS[template.category]} · {template.permissions.length} draft{template.permissions.length === 1 ? "" : "s"}</small>
            </button>
          ))}
        </div>
      </section>

      {editor ? (
        <PermissionEditor
          agentId={agentId}
          initialDrafts={editor.drafts}
          initialPermission={editor.permission}
          mode={editor.mode}
          onClose={() => setEditor(null)}
          onSaved={reload}
          permissions={permissions}
          workspaceAuthority={workspaceAuthority}
        />
      ) : null}
    </div>
  );
}
