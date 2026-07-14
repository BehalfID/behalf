"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { getRequiredRoleLabel } from "@/lib/authority";
import { useDashboardApi } from "@/components/workspace/WorkspaceProvider";
import {
  EMPTY_PERMISSION_DRAFT,
  findOverlappingPermissions,
  isCommandAction,
  isFileAction,
  isPaymentAction,
  listToText,
  permissionDraftAuthority,
  serializePermissionDraft,
  textToList,
  toDateTimeLocal
} from "./permissionDrafts";
import { PermissionReplacementReview } from "./PermissionReplacementReview";
import type {
  AgentPermission,
  PermissionDraft,
  WorkspaceAuthority
} from "./types";

export type PermissionEditorMode = "create" | "replace" | "template";

type ReplacementResult = {
  retiredPermissionId: string;
  retiredStatus: "revoked";
  permissionId: string;
  status: "active";
  requiredAuthorityLevel: number;
  overlapPermissionIds: string[];
};

function ConstraintFields({
  draft,
  update
}: {
  draft: PermissionDraft;
  update: (next: PermissionDraft) => void;
}) {
  const setConstraints = (next: Partial<PermissionDraft["constraints"]>) => {
    update({ ...draft, constraints: { ...draft.constraints, ...next } });
  };
  return (
    <>
      {isCommandAction(draft.action) ? (
        <label>
          <span>Denied commands</span>
          <textarea
            rows={4}
            value={listToText(draft.constraints.deniedCommands)}
            onChange={(event) => setConstraints({ deniedCommands: textToList(event.target.value) })}
            placeholder={"rm -rf\ncurl\nwget"}
          />
          <small className="field-help">One substring per line. Matching commands are denied before execution.</small>
        </label>
      ) : null}
      {isFileAction(draft.action) ? (
        <div className="permission-editor__columns">
          <label>
            <span>Allowed paths</span>
            <textarea
              rows={4}
              value={listToText(draft.constraints.allowedPaths)}
              onChange={(event) => setConstraints({ allowedPaths: textToList(event.target.value) })}
              placeholder={"src/**\ntests/**"}
            />
          </label>
          <label>
            <span>Denied paths</span>
            <textarea
              rows={4}
              value={listToText(draft.constraints.deniedPaths)}
              onChange={(event) => setConstraints({ deniedPaths: textToList(event.target.value) })}
              placeholder={"**/.env\n~/.ssh/**"}
            />
          </label>
        </div>
      ) : null}
      {isPaymentAction(draft.action) ? (
        <div className="permission-editor__columns">
          <label>
            <span>Allowed vendors</span>
            <textarea
              rows={3}
              value={listToText(draft.constraints.allowedVendors)}
              onChange={(event) => setConstraints({ allowedVendors: textToList(event.target.value) })}
              placeholder={"vendor.example\nstripe.com"}
            />
          </label>
          <label>
            <span>Maximum amount</span>
            <input
              min="0"
              type="number"
              value={draft.constraints.maxAmount ?? ""}
              onChange={(event) => setConstraints({
                maxAmount: event.target.value === "" ? undefined : Number(event.target.value)
              })}
            />
          </label>
        </div>
      ) : null}
      <div className="permission-editor__columns">
        <label>
          <span>Allowed actions</span>
          <textarea
            rows={3}
            value={listToText(draft.allowedActions)}
            onChange={(event) => update({ ...draft, allowedActions: textToList(event.target.value) })}
            placeholder={"run tests\nrun linter"}
          />
        </label>
        <label>
          <span>Blocked actions</span>
          <textarea
            rows={3}
            value={listToText(draft.blockedActions)}
            onChange={(event) => update({ ...draft, blockedActions: textToList(event.target.value) })}
            placeholder={"deploy to production\nread credentials"}
          />
        </label>
      </div>
      <label>
        <span>Notes</span>
        <textarea rows={2} value={draft.notes} onChange={(event) => update({ ...draft, notes: event.target.value })} />
      </label>
    </>
  );
}

function DraftReview({ draft, index }: { draft: PermissionDraft; index?: number }) {
  const authority = permissionDraftAuthority(draft);
  const constraints = draft.constraints;
  return (
    <article className="permission-draft-review">
      <header>
        <strong>{index == null ? "Resulting policy" : `Permission ${index + 1}`}</strong>
        <span><code>{draft.action}</code> on <code>{draft.resource || "any resource"}</code></span>
      </header>
      <dl className="permission-review-list">
        <div><dt>Approval</dt><dd>{draft.requiresApproval ? "Approval required" : "No approval required"}</dd></div>
        {draft.requiresApproval ? (
          <div><dt>Minimum approver</dt><dd>{getRequiredRoleLabel(authority.requiredAuthorityLevel)}</dd></div>
        ) : null}
        <div><dt>Denied commands</dt><dd>{constraints.deniedCommands?.join(", ") || "None"}</dd></div>
        <div><dt>Allowed paths</dt><dd>{constraints.allowedPaths?.join(", ") || "Any path"}</dd></div>
        <div><dt>Denied paths</dt><dd>{constraints.deniedPaths?.join(", ") || "None"}</dd></div>
        <div><dt>Allowed vendors</dt><dd>{constraints.allowedVendors?.join(", ") || "Any vendor"}</dd></div>
        <div><dt>Amount limit</dt><dd>{typeof constraints.maxAmount === "number" ? `$${constraints.maxAmount}` : "None"}</dd></div>
        <div><dt>Allowed actions</dt><dd>{draft.allowedActions.join(", ") || "None listed"}</dd></div>
        <div><dt>Blocked actions</dt><dd>{draft.blockedActions.join(", ") || "None listed"}</dd></div>
        <div><dt>Expiration</dt><dd>{constraints.expiresAt ? new Date(constraints.expiresAt).toLocaleString() : "No expiration"}</dd></div>
      </dl>
    </article>
  );
}

export function PermissionEditor({
  agentId,
  mode,
  permissions,
  workspaceAuthority,
  initialPermission,
  initialDrafts,
  onClose,
  onSaved
}: {
  agentId: string;
  mode: PermissionEditorMode;
  permissions: AgentPermission[];
  workspaceAuthority?: WorkspaceAuthority | null;
  initialPermission?: AgentPermission;
  initialDrafts?: PermissionDraft[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { apiJson } = useDashboardApi();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [drafts, setDrafts] = useState<PermissionDraft[]>(
    initialDrafts?.length ? initialDrafts : [{ ...EMPTY_PERMISSION_DRAFT, constraints: {} }]
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [step, setStep] = useState(mode === "template" ? 4 : 1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [replacementResult, setReplacementResult] = useState<ReplacementResult | null>(null);
  const draft = drafts[currentIndex] ?? drafts[0];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  const overlaps = useMemo(
    () => drafts.flatMap((item) => findOverlappingPermissions(item, permissions, initialPermission?.permissionId)),
    [drafts, permissions, initialPermission?.permissionId]
  );
  const uniqueOverlaps = [...new Map(overlaps.map((permission) => [permission.permissionId, permission])).values()];
  const maximumAuthority = Math.max(...drafts.map((item) => permissionDraftAuthority(item).requiredAuthorityLevel));
  const canSave = Boolean(workspaceAuthority && workspaceAuthority.authorityLevel >= maximumAuthority);

  const updateDraft = (next: PermissionDraft) => {
    setDrafts((current) => current.map((item, index) => index === currentIndex ? next : item));
  };

  const nextStep = () => {
    setError("");
    if (step === 1 && !draft.action.trim()) {
      setError("Choose an action before continuing.");
      return;
    }
    setStep((current) => Math.min(4, current + 1));
  };

  const editTemplateDraft = (index: number) => {
    setCurrentIndex(index);
    setStep(1);
  };

  const submit = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setError("");
    try {
      if (mode === "replace" && initialPermission) {
        const result = await apiJson<ReplacementResult>(
          `/api/dashboard/agents/${agentId}/permissions/${initialPermission.permissionId}/replace`,
          { method: "POST", body: JSON.stringify(serializePermissionDraft(drafts[0])) }
        );
        setReplacementResult(result);
        await onSaved();
        return;
      }
      for (const item of drafts) {
        await apiJson(`/api/dashboard/agents/${agentId}/permissions`, {
          method: "POST",
          body: JSON.stringify(serializePermissionDraft(item))
        });
      }
      await onSaved();
      onClose();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Permission save failed.");
    } finally {
      setSaving(false);
    }
  };

  if (mode === "replace" && initialPermission?.status !== "active") {
    return null;
  }

  return (
    <dialog
      aria-labelledby="permission-editor-title"
      className="permission-editor"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      ref={dialogRef}
    >
      <div className="permission-editor__header">
        <div>
          <p className="ui-kicker">{mode === "replace" ? "Replace permission" : mode === "template" ? "Template draft" : "Add permission"}</p>
          <h2 id="permission-editor-title">
            {replacementResult ? "Permission replaced safely" : `Step ${step} of 4`}
          </h2>
        </div>
        <Button aria-label="Close permission editor" onClick={onClose} type="button">Close</Button>
      </div>

      {replacementResult ? (
        <div className="permission-editor__result" role="status">
          <p><strong>Old permission retired</strong></p>
          <code>{replacementResult.retiredPermissionId}</code>
          <p><strong>New permission active</strong></p>
          <code>{replacementResult.permissionId}</code>
          <p>The retired permission remains in audit history and links to its replacement.</p>
          <Button variant="primary" onClick={onClose} type="button">Done</Button>
        </div>
      ) : (
        <>
          <ol className="permission-editor__steps" aria-label="Permission editor progress">
            {["Action and resource", "Behavior and constraints", "Approval and expiration", "Review policy"].map((label, index) => (
              <li aria-current={step === index + 1 ? "step" : undefined} key={label}>{index + 1}. {label}</li>
            ))}
          </ol>

          <div className="permission-editor__body">
            {step === 1 ? (
              <div className="permission-editor__form">
                <h3>Choose the action and resource</h3>
                {drafts.length > 1 ? <p className="field-help">Editing template permission {currentIndex + 1} of {drafts.length}.</p> : null}
                <label>
                  <span>Action</span>
                  <input
                    autoFocus
                    list="permission-action-options"
                    required
                    value={draft.action}
                    onChange={(event) => updateDraft({ ...draft, action: event.target.value })}
                    placeholder="execute_command"
                  />
                  <datalist id="permission-action-options">
                    <option value="execute_command" />
                    <option value="read_file" />
                    <option value="write_file" />
                    <option value="browse_web" />
                    <option value="purchase" />
                    <option value="send_email" />
                    <option value="deploy" />
                  </datalist>
                </label>
                <label>
                  <span>Resource</span>
                  <input value={draft.resource} onChange={(event) => updateDraft({ ...draft, resource: event.target.value })} placeholder="shell" />
                </label>
                <label>
                  <span>Description</span>
                  <input value={draft.description} onChange={(event) => updateDraft({ ...draft, description: event.target.value })} />
                </label>
                <label>
                  <span>Scope</span>
                  <input value={draft.scope} onChange={(event) => updateDraft({ ...draft, scope: event.target.value })} />
                </label>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="permission-editor__form">
                <h3>Define allowed and blocked behavior</h3>
                <ConstraintFields draft={draft} update={updateDraft} />
              </div>
            ) : null}

            {step === 3 ? (
              <div className="permission-editor__form">
                <h3>Configure approval and expiration</h3>
                <label className="permission-editor__checkbox">
                  <input
                    checked={draft.requiresApproval}
                    onChange={(event) => updateDraft({ ...draft, requiresApproval: event.target.checked })}
                    type="checkbox"
                  />
                  <span>Require approval before this permission can be used</span>
                </label>
                {draft.requiresApproval ? (
                  <div className="permission-editor__authority" role="status">
                    <strong>Minimum approver: {getRequiredRoleLabel(permissionDraftAuthority(draft).requiredAuthorityLevel)}</strong>
                    <p>This role is derived from the action and constraints and is enforced by existing workspace authority rules.</p>
                  </div>
                ) : null}
                <label>
                  <span>Expires at</span>
                  <input
                    type="datetime-local"
                    value={toDateTimeLocal(draft.constraints.expiresAt)}
                    onChange={(event) => updateDraft({
                      ...draft,
                      constraints: { ...draft.constraints, expiresAt: event.target.value || undefined }
                    })}
                  />
                </label>
              </div>
            ) : null}

            {step === 4 ? (
              <div>
                <h3>Review the complete resulting policy</h3>
                {mode === "replace" && initialPermission ? (
                  <PermissionReplacementReview before={initialPermission} after={drafts[0]} />
                ) : (
                  <div className="permission-draft-review-list">
                    {drafts.map((item, index) => (
                      <div key={`${item.action}-${item.resource}-${index}`}>
                        <DraftReview draft={item} index={drafts.length > 1 ? index : undefined} />
                        {drafts.length > 1 ? <Button onClick={() => editTemplateDraft(index)} type="button">Edit this draft</Button> : null}
                      </div>
                    ))}
                  </div>
                )}
                {uniqueOverlaps.length ? (
                  <div className="dashboard-banner dashboard-banner--warning" role="alert">
                    <strong>Overlapping active permission{uniqueOverlaps.length === 1 ? "" : "s"}</strong>
                    <p>{uniqueOverlaps.map((permission) => permission.permissionId).join(", ")} use the same action and resource. They will remain active and will not be revoked automatically.</p>
                  </div>
                ) : null}
                {!canSave ? (
                  <p className="form-error" role="alert">
                    Your {workspaceAuthority?.roleLabel ?? "workspace role"} role cannot grant the authority required by this policy.
                  </p>
                ) : null}
                <p className="field-help">
                  {mode === "replace"
                    ? "Confirming retires only the selected permission and creates a new active permission with a new ID."
                    : `Confirming creates ${drafts.length} permission${drafts.length === 1 ? "" : "s"}. No write occurs before confirmation.`}
                </p>
              </div>
            ) : null}
          </div>

          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <div className="permission-editor__footer">
            <div className="form-actions">
              {step > 1 ? <Button onClick={() => setStep((current) => current - 1)} type="button">Back</Button> : null}
              {step < 4 ? <Button variant="primary" onClick={nextStep} type="button">Continue</Button> : null}
              {step === 4 ? (
                <Button disabled={!canSave || saving} variant="primary" onClick={() => void submit()} type="button">
                  {saving ? "Saving…" : mode === "replace" ? "Confirm replacement" : `Create ${drafts.length} permission${drafts.length === 1 ? "" : "s"}`}
                </Button>
              ) : null}
            </div>
            <Button onClick={onClose} type="button">Cancel</Button>
          </div>
        </>
      )}
    </dialog>
  );
}
