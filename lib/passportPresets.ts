import { SCOPE_TEMPLATES, type ScopeCategory } from "./scopeTemplates";
import type { AgentProvider } from "./agents";

export type PassportPreset = {
  id: string;
  label: string;
  tagline: string;
  provider: AgentProvider;
  agentDescription: string;
  scopeIds: string[];
};

export const PASSPORT_PRESETS: PassportPreset[] = [
  {
    id: "email_reader",
    label: "Email reader",
    tagline: "Read and summarize emails. Cannot send, delete, or forward.",
    provider: "chatgpt",
    agentDescription:
      "Read and summarize my emails, but do not send, delete, forward, or change filters.",
    scopeIds: ["read_email"]
  },
  {
    id: "scheduler",
    label: "Scheduling assistant",
    tagline: "Check availability and book meetings. Cannot delete or share calendar.",
    provider: "claude",
    agentDescription:
      "Help me schedule meetings by reading my calendar and proposing times. Ask before creating or modifying any events.",
    scopeIds: ["read_calendar", "schedule_meeting"]
  },
  {
    id: "researcher",
    label: "Research assistant",
    tagline: "Browse the web and read documents. Cannot submit forms or make purchases.",
    provider: "chatgpt",
    agentDescription:
      "Research topics by browsing the web and reading public documents. Do not submit forms, log in, or purchase anything.",
    scopeIds: ["browse_web", "read_documents"]
  },
  {
    id: "shopper",
    label: "Shopping assistant",
    tagline: "Research and purchase items within set limits. Requires your approval.",
    provider: "claude",
    agentDescription:
      "Compare products and make purchases under a defined amount only after I approve them.",
    scopeIds: ["browse_web", "purchase"]
  },
  {
    id: "content_creator",
    label: "Content creator",
    tagline: "Draft and edit documents. Cannot publish or share externally.",
    provider: "claude",
    agentDescription:
      "Help me create and edit documents and content drafts. Do not publish or share externally without my approval.",
    scopeIds: ["read_documents", "create_content"]
  },
  {
    id: "crm_assistant",
    label: "CRM assistant",
    tagline: "Read and update customer records. Cannot delete or export data.",
    provider: "chatgpt",
    agentDescription:
      "Read and update customer contacts and deals in my CRM. Do not delete records or export bulk data.",
    scopeIds: ["read_crm", "update_crm"]
  }
];

type RiskLevel = "low" | "medium" | "high";

function categoryToRisk(category: ScopeCategory): RiskLevel {
  if (category === "commerce" || category === "admin") return "high";
  if (category === "communication" || category === "scheduling" || category === "content")
    return "medium";
  return "low";
}

export function buildPresetPermissions(preset: PassportPreset): Array<{
  action: string;
  resource: string;
  allowedActions: string[];
  blockedActions: string[];
  requiresApproval: boolean;
  status: "active";
  riskLevel: RiskLevel;
  reason: string;
  constraints?: { maxAmount?: number; allowedVendors?: string[]; expiresAt?: null };
}> {
  return preset.scopeIds.flatMap((scopeId) => {
    const scope = SCOPE_TEMPLATES.find((t) => t.id === scopeId);
    if (!scope || scope.id === "custom") return [];
    return [
      {
        action: scope.defaultAction,
        resource: scope.exampleResource,
        allowedActions: [...scope.defaultAllowedActions],
        blockedActions: [...scope.defaultBlockedActions],
        requiresApproval: scope.requiresApprovalDefault,
        status: "active" as const,
        riskLevel: categoryToRisk(scope.category),
        reason: scope.description
      }
    ];
  });
}
