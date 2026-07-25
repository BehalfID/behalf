export type AgentManagementRecord = {
  agentId: string;
  name: string;
  status: string;
  agentType: "native" | "connected";
  provider: string;
  connectionStatus: "manual" | "connected" | "disconnected";
  description?: string | null;
  createdAt?: string;
  lastUsedAt?: string | null;
  keyRotatedAt?: string | null;
};

export type PermissionManagementRecord = {
  permissionId: string;
  action: string;
  status: string;
  description?: string;
  resource?: string;
  scope?: string;
  allowedActions?: string[];
  blockedActions?: string[];
  requiresApproval?: boolean;
  notes?: string;
  template?: string;
  constraints?: {
    maxAmount?: number;
    allowedVendors?: string[];
    expiresAt?: string;
    allowedPaths?: string[];
    deniedPaths?: string[];
    deniedCommands?: string[];
  };
  requiredAuthorityLevel?: number;
  lastUsedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export function permissionEffectiveStatus(permission: PermissionManagementRecord): "active" | "expired" | "revoked" {
  if (permission.status === "revoked") return "revoked";
  const expiresAt = permission.constraints?.expiresAt;
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) return "expired";
  return "active";
}

export function permissionIsBroad(permission: PermissionManagementRecord): boolean {
  const constraints = permission.constraints;
  return !permission.resource &&
    !permission.scope &&
    !permission.allowedActions?.length &&
    !permission.blockedActions?.length &&
    typeof constraints?.maxAmount !== "number" &&
    !constraints?.allowedVendors?.length &&
    !constraints?.expiresAt &&
    !constraints?.allowedPaths?.length &&
    !constraints?.deniedPaths?.length &&
    !constraints?.deniedCommands?.length;
}
