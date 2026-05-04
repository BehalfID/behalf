import { isRecord, readString } from "@/lib/validation";

export const PERMISSION_TEMPLATES = [
  "access_data",
  "create_content",
  "schedule",
  "purchase",
  "custom"
] as const;

export type PermissionTemplate = (typeof PERMISSION_TEMPLATES)[number];

function optionalString(value: unknown, field: string, maxLength = 500) {
  if (value === undefined) return { value: undefined as string | undefined, error: null as string | null };
  const stringValue = readString(value);
  if (!stringValue) return { value: undefined, error: null };
  if (stringValue.length > maxLength) return { value: undefined, error: `${field} must be ${maxLength} characters or fewer.` };
  return { value: stringValue, error: null };
}

export function parsePermissionMetadata(body: unknown) {
  if (!isRecord(body)) return { metadata: null, error: "Request body must be a JSON object." };

  const resource = optionalString(body.resource, "resource", 240);
  if (resource.error) return { metadata: null, error: resource.error };
  const scope = optionalString(body.scope, "scope", 500);
  if (scope.error) return { metadata: null, error: scope.error };
  const notes = optionalString(body.notes, "notes", 800);
  if (notes.error) return { metadata: null, error: notes.error };

  let template: PermissionTemplate | undefined;
  if (body.template !== undefined) {
    const templateValue = readString(body.template);
    if (!PERMISSION_TEMPLATES.includes(templateValue as PermissionTemplate)) {
      return { metadata: null, error: `template must be one of: ${PERMISSION_TEMPLATES.join(", ")}.` };
    }
    template = templateValue as PermissionTemplate;
  }

  let blockedActions: string[] | undefined;
  if (body.blockedActions !== undefined) {
    if (!Array.isArray(body.blockedActions) || body.blockedActions.some((item) => typeof item !== "string" || !item.trim())) {
      return { metadata: null, error: "blockedActions must be an array of non-empty strings." };
    }
    blockedActions = body.blockedActions.map((item) => item.trim());
  }

  let requiresApproval: boolean | undefined;
  if (body.requiresApproval !== undefined) {
    if (typeof body.requiresApproval !== "boolean") {
      return { metadata: null, error: "requiresApproval must be a boolean." };
    }
    requiresApproval = body.requiresApproval;
  }

  return {
    metadata: {
      resource: resource.value,
      scope: scope.value,
      blockedActions,
      requiresApproval,
      notes: notes.value,
      template
    },
    error: null
  };
}
