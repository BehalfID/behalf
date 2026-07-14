export const AGENT_DETAIL_SECTIONS = [
  "overview",
  "permissions",
  "integrations",
  "activity"
] as const;

export type AgentDetailSection = (typeof AGENT_DETAIL_SECTIONS)[number];

export function isAgentDetailSection(value: string): value is AgentDetailSection {
  return (AGENT_DETAIL_SECTIONS as readonly string[]).includes(value);
}

export type AgentProvider =
  | "custom"
  | "ollie"
  | "chatgpt"
  | "claude"
  | "gemini"
  | "zapier"
  | "make"
  | "langchain"
  | "openai"
  | "other";

export type AgentDetail = {
  agentId: string;
  name: string;
  status: string;
  agentType: "native" | "connected";
  provider: AgentProvider;
  connectionStatus: "manual" | "connected" | "disconnected";
  externalAgentId?: string | null;
  externalAgentLabel?: string | null;
  description?: string | null;
  createdAt?: string;
  updatedAt?: string;
  lastUsedAt?: string | null;
  keyRotatedAt?: string | null;
  publicPassportEnabled?: boolean;
  guidelines?: string[];
};

export type PermissionTemplate =
  | "access_data"
  | "create_content"
  | "schedule"
  | "purchase"
  | "custom";

export type PermissionConstraints = {
  maxAmount?: number;
  allowedVendors?: string[];
  expiresAt?: string;
  allowedPaths?: string[];
  deniedPaths?: string[];
  deniedCommands?: string[];
};

export type AgentPermission = {
  permissionId: string;
  action: string;
  status: "active" | "revoked";
  description?: string;
  resource?: string;
  scope?: string;
  allowedActions?: string[];
  blockedActions?: string[];
  requiresApproval?: boolean;
  notes?: string;
  template?: PermissionTemplate;
  constraints?: PermissionConstraints;
  requiredAuthorityLevel?: number;
  replacesPermissionId?: string | null;
  replacedByPermissionId?: string | null;
  lastUsedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type WorkspaceAuthority = {
  role: string;
  roleLabel: string;
  authorityLevel: number;
};

export type SecurityPosture = {
  activePermissions: number;
  approvalGatedPermissions: number;
  revokedPermissions: number;
  recentDeniedActions: number;
  recentDeniedSince: string;
};

export type AgentDetailResponse = {
  agent: AgentDetail;
  permissions: AgentPermission[];
  securityPosture: SecurityPosture;
  workspaceAuthority?: WorkspaceAuthority | null;
};

export type PermissionDraft = {
  action: string;
  description: string;
  resource: string;
  scope: string;
  allowedActions: string[];
  blockedActions: string[];
  requiresApproval: boolean;
  notes: string;
  template?: PermissionTemplate;
  constraints: PermissionConstraints;
};

export type ActivityLog = {
  requestId: string;
  agentId: string;
  agentName?: string | null;
  permissionId?: string | null;
  action: string;
  amount?: number;
  vendor?: string | null;
  allowed: boolean;
  approvalRequired?: boolean;
  decision?: "allowed" | "denied" | "approval_required";
  approvalId?: string | null;
  reason: string;
  risk: "low" | "medium" | "high";
  createdAt?: string;
};

export type ActivityResponse = {
  logs: ActivityLog[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    hasMore: boolean;
  };
};
