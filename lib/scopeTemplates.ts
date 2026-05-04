export type ScopeCategory =
  | "data_access"
  | "communication"
  | "scheduling"
  | "commerce"
  | "content"
  | "admin"
  | "custom";

export type ScopeTemplate = {
  id: string;
  label: string;
  category: ScopeCategory;
  description: string;
  defaultAction: string;
  defaultAllowedActions: string[];
  defaultBlockedActions: string[];
  requiresApprovalDefault: boolean;
  exampleResource: string;
};

export const SCOPE_TEMPLATES: ScopeTemplate[] = [
  {
    id: "read_email",
    label: "Read email",
    category: "data_access",
    description: "Read and summarize email messages without sending or modifying.",
    defaultAction: "access_data",
    defaultAllowedActions: ["read labels", "summarize messages", "search inbox"],
    defaultBlockedActions: ["send email", "delete messages", "mark as read", "make purchases"],
    requiresApprovalDefault: true,
    exampleResource: "gmail.com"
  },
  {
    id: "send_email",
    label: "Send email",
    category: "communication",
    description: "Draft and send email messages on behalf of the user.",
    defaultAction: "send_email",
    defaultAllowedActions: ["draft email", "send email"],
    defaultBlockedActions: ["delete messages", "forward to external addresses", "modify inbox rules"],
    requiresApprovalDefault: true,
    exampleResource: "gmail.com"
  },
  {
    id: "browse_web",
    label: "Browse web",
    category: "data_access",
    description: "Search the web and read publicly accessible pages.",
    defaultAction: "browse_web",
    defaultAllowedActions: ["search web", "read public pages", "extract structured data"],
    defaultBlockedActions: ["submit forms", "make purchases", "login to accounts"],
    requiresApprovalDefault: false,
    exampleResource: "web"
  },
  {
    id: "read_calendar",
    label: "Read calendar",
    category: "scheduling",
    description: "Read calendar events to find availability.",
    defaultAction: "access_data",
    defaultAllowedActions: ["read events", "check availability", "list upcoming meetings"],
    defaultBlockedActions: ["create events", "delete events", "invite attendees", "share calendar"],
    requiresApprovalDefault: false,
    exampleResource: "calendar.google.com"
  },
  {
    id: "write_calendar",
    label: "Create calendar events",
    category: "scheduling",
    description: "Create and update calendar events.",
    defaultAction: "schedule",
    defaultAllowedActions: ["create events", "update events", "send invites"],
    defaultBlockedActions: ["delete events", "share calendar", "create recurring events"],
    requiresApprovalDefault: true,
    exampleResource: "calendar.google.com"
  },
  {
    id: "schedule_meeting",
    label: "Schedule meetings",
    category: "scheduling",
    description: "Find times and book meetings using scheduling tools.",
    defaultAction: "schedule",
    defaultAllowedActions: ["check availability", "propose times", "create meeting"],
    defaultBlockedActions: ["cancel existing meetings", "modify recurring events"],
    requiresApprovalDefault: true,
    exampleResource: "calendly.com"
  },
  {
    id: "read_documents",
    label: "Read documents",
    category: "data_access",
    description: "Read documents and extract information.",
    defaultAction: "access_data",
    defaultAllowedActions: ["read documents", "extract text", "summarize content"],
    defaultBlockedActions: ["edit documents", "delete files", "share externally"],
    requiresApprovalDefault: false,
    exampleResource: "drive.google.com"
  },
  {
    id: "edit_documents",
    label: "Edit documents",
    category: "content",
    description: "Create and modify documents.",
    defaultAction: "create_content",
    defaultAllowedActions: ["create documents", "edit content", "format text"],
    defaultBlockedActions: ["delete files", "share with external users", "change permissions"],
    requiresApprovalDefault: true,
    exampleResource: "drive.google.com"
  },
  {
    id: "read_crm",
    label: "Read CRM records",
    category: "data_access",
    description: "Read customer and contact records from CRM.",
    defaultAction: "access_data",
    defaultAllowedActions: ["read contacts", "read deals", "read notes", "search records"],
    defaultBlockedActions: ["create contacts", "delete records", "export data", "send emails"],
    requiresApprovalDefault: false,
    exampleResource: "salesforce.com"
  },
  {
    id: "update_crm",
    label: "Update CRM records",
    category: "admin",
    description: "Create and update CRM contacts, deals, and notes.",
    defaultAction: "access_data",
    defaultAllowedActions: ["create contacts", "update deals", "add notes", "log activity"],
    defaultBlockedActions: ["delete records", "export bulk data", "modify pipelines", "send emails"],
    requiresApprovalDefault: true,
    exampleResource: "salesforce.com"
  },
  {
    id: "create_invoice",
    label: "Create invoices",
    category: "commerce",
    description: "Generate invoices and quotes.",
    defaultAction: "create_content",
    defaultAllowedActions: ["create invoice", "create quote", "add line items"],
    defaultBlockedActions: ["issue refunds", "delete invoices", "modify payment terms"],
    requiresApprovalDefault: true,
    exampleResource: "stripe.com"
  },
  {
    id: "issue_refund",
    label: "Issue refunds",
    category: "commerce",
    description: "Process refunds for existing transactions.",
    defaultAction: "purchase",
    defaultAllowedActions: ["issue refund", "void transaction"],
    defaultBlockedActions: ["create charges", "modify subscription", "delete payment method"],
    requiresApprovalDefault: true,
    exampleResource: "stripe.com"
  },
  {
    id: "purchase",
    label: "Make purchases",
    category: "commerce",
    description: "Complete purchases within defined amount and vendor constraints.",
    defaultAction: "purchase",
    defaultAllowedActions: ["add to cart", "checkout", "confirm purchase"],
    defaultBlockedActions: ["modify subscription", "issue refunds", "save payment method"],
    requiresApprovalDefault: true,
    exampleResource: "coachella.com"
  },
  {
    id: "send_message",
    label: "Send messages",
    category: "communication",
    description: "Send messages in chat or collaboration tools.",
    defaultAction: "send_message",
    defaultAllowedActions: ["send message", "post to channel", "reply to thread"],
    defaultBlockedActions: ["delete messages", "create channels", "invite users", "send DMs"],
    requiresApprovalDefault: true,
    exampleResource: "slack.com"
  },
  {
    id: "create_content",
    label: "Create content",
    category: "content",
    description: "Generate written content like posts, summaries, or reports.",
    defaultAction: "create_content",
    defaultAllowedActions: ["draft content", "generate summary", "write report"],
    defaultBlockedActions: ["publish content", "send to external recipients", "post publicly"],
    requiresApprovalDefault: false,
    exampleResource: "notion.so"
  },
  {
    id: "access_data",
    label: "Access data (general)",
    category: "data_access",
    description: "Read data from a service or data source.",
    defaultAction: "access_data",
    defaultAllowedActions: ["read data", "query records", "export report"],
    defaultBlockedActions: ["write data", "delete records", "modify schema"],
    requiresApprovalDefault: false,
    exampleResource: ""
  },
  {
    id: "custom",
    label: "Custom scope",
    category: "custom",
    description: "Define your own action, resource, and allowed/blocked actions.",
    defaultAction: "",
    defaultAllowedActions: [],
    defaultBlockedActions: [],
    requiresApprovalDefault: false,
    exampleResource: ""
  }
];

export const SCOPE_CATEGORY_LABELS: Record<ScopeCategory, string> = {
  data_access: "Data access",
  communication: "Communication",
  scheduling: "Scheduling",
  commerce: "Commerce",
  content: "Content",
  admin: "Admin",
  custom: "Custom"
};

export function getScopeTemplate(id: string): ScopeTemplate | undefined {
  return SCOPE_TEMPLATES.find((t) => t.id === id);
}

export function getScopesByCategory(): Record<ScopeCategory, ScopeTemplate[]> {
  const result = {} as Record<ScopeCategory, ScopeTemplate[]>;
  for (const template of SCOPE_TEMPLATES) {
    if (!result[template.category]) result[template.category] = [];
    result[template.category].push(template);
  }
  return result;
}
