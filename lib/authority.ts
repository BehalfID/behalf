export const WORKSPACE_ROLES = [
  "OWNER",
  "ENGINEERING_LEAD",
  "SENIOR_ENGINEER",
  "ENGINEER",
  "VIEWER"
] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

/** Internal authority level for agents — they never grant permissions. */
export const AGENT_AUTHORITY_LEVEL = 0;

export const AUTHORITY_LEVELS: Record<WorkspaceRole, number> = {
  OWNER: 100,
  ENGINEERING_LEAD: 80,
  SENIOR_ENGINEER: 60,
  ENGINEER: 40,
  VIEWER: 10
};

export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  OWNER: "Owner",
  ENGINEERING_LEAD: "Engineering Lead",
  SENIOR_ENGINEER: "Senior Engineer",
  ENGINEER: "Engineer",
  VIEWER: "Viewer"
};

export function getAuthorityLevelForRole(role: WorkspaceRole): number {
  return AUTHORITY_LEVELS[role];
}

export function getRoleForAuthorityLevel(level: number): WorkspaceRole {
  if (level >= AUTHORITY_LEVELS.OWNER) return "OWNER";
  if (level >= AUTHORITY_LEVELS.ENGINEERING_LEAD) return "ENGINEERING_LEAD";
  if (level >= AUTHORITY_LEVELS.SENIOR_ENGINEER) return "SENIOR_ENGINEER";
  if (level >= AUTHORITY_LEVELS.ENGINEER) return "ENGINEER";
  return "VIEWER";
}

export function getRoleLabel(role: WorkspaceRole): string {
  return ROLE_LABELS[role];
}

export function getRequiredRoleLabel(level: number): string {
  return getRoleLabel(getRoleForAuthorityLevel(level));
}

export function isWorkspaceRole(value: string): value is WorkspaceRole {
  return (WORKSPACE_ROLES as readonly string[]).includes(value);
}

/** Invalid or unknown stored roles resolve to least privilege. */
export function resolveWorkspaceRole(value: string): WorkspaceRole {
  return isWorkspaceRole(value) ? value : "VIEWER";
}
