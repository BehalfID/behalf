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
  },
  {
    id: "customer_support",
    label: "Customer support agent",
    tagline: "Read and reply to support tickets. Cannot issue refunds or delete tickets.",
    provider: "claude",
    agentDescription:
      "Read customer support tickets, add internal notes, update statuses, and reply to customers. Do not issue refunds, close accounts, or delete tickets.",
    scopeIds: ["read_tickets", "update_tickets"]
  },
  {
    id: "social_manager",
    label: "Social media manager",
    tagline: "Draft and schedule posts. Cannot publish without approval.",
    provider: "claude",
    agentDescription:
      "Draft and schedule social media posts and reply to comments. Requires my approval before any post is published.",
    scopeIds: ["create_content", "post_social"]
  },
  {
    id: "developer",
    label: "Developer assistant",
    tagline: "Read code and open PRs. Cannot merge to main or delete branches.",
    provider: "claude",
    agentDescription:
      "Read code files, view commits and pull requests, create branches, and open pull requests for review. Cannot merge to main or change repository settings.",
    scopeIds: ["read_code", "write_code"]
  },
  {
    id: "data_analyst",
    label: "Data analyst",
    tagline: "Read analytics dashboards and documents. Cannot modify data or settings.",
    provider: "chatgpt",
    agentDescription:
      "Read analytics dashboards, export reports, and summarize documents. Do not modify tracking, delete data, or change account settings.",
    scopeIds: ["read_analytics", "read_documents"]
  },
  {
    id: "finance_reviewer",
    label: "Finance reviewer",
    tagline: "Read financial records and draft invoices. Cannot issue refunds or make charges.",
    provider: "chatgpt",
    agentDescription:
      "Read invoices, financial reports, and account balances, and draft new invoices for review. Do not issue refunds, create charges, or modify payment methods.",
    scopeIds: ["read_finance", "create_invoice"]
  },
  {
    id: "project_manager",
    label: "Project manager",
    tagline: "Track tasks and read documentation. Cannot delete tasks or modify project settings.",
    provider: "claude",
    agentDescription:
      "Read and create tasks, update statuses, add comments, and read project documentation. Do not delete tasks or modify project settings.",
    scopeIds: ["manage_tasks", "read_documents"]
  },
  {
    id: "travel_planner",
    label: "Travel planner",
    tagline: "Research and book travel within budget. Requires approval before booking.",
    provider: "chatgpt",
    agentDescription:
      "Research flights, hotels, and transportation options and book within a defined budget. Always ask for my approval before confirming a booking.",
    scopeIds: ["browse_web", "book_travel"]
  },
  {
    id: "devops_monitor",
    label: "DevOps monitor",
    tagline: "Read logs, metrics, and code. Cannot modify alerts or deploy code.",
    provider: "claude",
    agentDescription:
      "Read application logs, error reports, system metrics, and code repositories to help diagnose issues. Cannot modify alert rules, deploy code, or change configurations.",
    scopeIds: ["read_monitoring", "read_code"]
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
