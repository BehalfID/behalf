import type { PolicyTemplate } from "@/lib/policyTemplates";
import { classifyPermissionRisk } from "@/lib/permissionRisk";
import type {
  AgentPermission,
  PermissionDraft,
  PermissionTemplate
} from "./types";

export const EMPTY_PERMISSION_DRAFT: PermissionDraft = {
  action: "",
  description: "",
  resource: "",
  scope: "",
  allowedActions: [],
  blockedActions: [],
  requiresApproval: false,
  notes: "",
  constraints: {}
};

export function actionToPermissionTemplate(action: string): PermissionTemplate {
  if (["access_data", "browse_web", "read_file"].includes(action)) return "access_data";
  if (["create_content", "send_email", "write_file"].includes(action)) return "create_content";
  if (["schedule", "read_calendar"].includes(action)) return "schedule";
  if (["purchase", "payment", "checkout", "refund", "charge"].includes(action)) return "purchase";
  return "custom";
}

export function permissionToDraft(permission: AgentPermission): PermissionDraft {
  return {
    action: permission.action,
    description: permission.description ?? "",
    resource: permission.resource ?? "",
    scope: permission.scope ?? "",
    allowedActions: [...(permission.allowedActions ?? [])],
    blockedActions: [...(permission.blockedActions ?? [])],
    requiresApproval: permission.requiresApproval === true,
    notes: permission.notes ?? "",
    template: permission.template ?? actionToPermissionTemplate(permission.action),
    constraints: {
      maxAmount: permission.constraints?.maxAmount,
      allowedVendors: [...(permission.constraints?.allowedVendors ?? [])],
      expiresAt: permission.constraints?.expiresAt,
      allowedPaths: [...(permission.constraints?.allowedPaths ?? [])],
      deniedPaths: [...(permission.constraints?.deniedPaths ?? [])],
      deniedCommands: [...(permission.constraints?.deniedCommands ?? [])]
    }
  };
}

export function permissionDraftsFromTemplate(template: PolicyTemplate): PermissionDraft[] {
  return template.permissions.map((permission) => ({
    action: permission.action,
    description: "",
    resource: permission.resource,
    scope: "",
    allowedActions: [...permission.allowedActions],
    blockedActions: [...permission.blockedActions],
    requiresApproval: permission.requiresApproval,
    notes: permission.notes ?? "",
    template: actionToPermissionTemplate(permission.action),
    constraints: {
      maxAmount: permission.constraints?.maxAmount,
      allowedVendors: [...(permission.constraints?.allowedVendors ?? [])]
    }
  }));
}

export function permissionDraftAuthority(draft: PermissionDraft) {
  return classifyPermissionRisk({
    action: draft.action,
    resource: draft.resource || undefined,
    scope: draft.scope || undefined,
    allowedActions: draft.allowedActions,
    blockedActions: draft.blockedActions,
    requiresApproval: draft.requiresApproval,
    template: draft.template,
    constraints: {
      maxAmount: draft.constraints.maxAmount,
      allowedVendors: draft.constraints.allowedVendors
    }
  });
}

export function serializePermissionDraft(draft: PermissionDraft) {
  return {
    action: draft.action.trim(),
    description: draft.description.trim() || undefined,
    resource: draft.resource.trim() || undefined,
    scope: draft.scope.trim() || undefined,
    allowedActions: draft.allowedActions.length ? draft.allowedActions : undefined,
    blockedActions: draft.blockedActions.length ? draft.blockedActions : undefined,
    requiresApproval: draft.requiresApproval,
    notes: draft.notes.trim() || undefined,
    template: draft.template,
    constraints: {
      maxAmount: draft.constraints.maxAmount,
      allowedVendors: draft.constraints.allowedVendors?.length
        ? draft.constraints.allowedVendors
        : undefined,
      expiresAt: draft.constraints.expiresAt
        ? new Date(draft.constraints.expiresAt).toISOString()
        : undefined,
      allowedPaths: draft.constraints.allowedPaths?.length
        ? draft.constraints.allowedPaths
        : undefined,
      deniedPaths: draft.constraints.deniedPaths?.length
        ? draft.constraints.deniedPaths
        : undefined,
      deniedCommands: draft.constraints.deniedCommands?.length
        ? draft.constraints.deniedCommands
        : undefined
    }
  };
}

export function findOverlappingPermissions(
  draft: Pick<PermissionDraft, "action" | "resource">,
  permissions: AgentPermission[],
  excludePermissionId?: string
) {
  const action = draft.action.trim().toLowerCase();
  const resource = draft.resource.trim().toLowerCase();
  return permissions.filter(
    (permission) =>
      permission.status === "active" &&
      permission.permissionId !== excludePermissionId &&
      permission.action.trim().toLowerCase() === action &&
      (permission.resource ?? "").trim().toLowerCase() === resource
  );
}

export function listToText(values?: string[]) {
  return values?.join("\n") ?? "";
}

export function textToList(value: string) {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function toDateTimeLocal(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function isFileAction(action: string) {
  return action === "read_file" || action === "write_file";
}

export function isCommandAction(action: string) {
  return action === "execute_command";
}

export function isPaymentAction(action: string) {
  return /purchase|payment|checkout|refund|charge/i.test(action);
}
