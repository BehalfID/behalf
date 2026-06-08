export type ScopeCategory =
  | "data_access"
  | "communication"
  | "scheduling"
  | "commerce"
  | "content"
  | "admin"
  | "developer"
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
    id: "read_analytics",
    label: "Read analytics",
    category: "data_access",
    description: "Read analytics dashboards and generate performance reports.",
    defaultAction: "access_data",
    defaultAllowedActions: ["view dashboards", "export reports", "query metrics", "filter by date range"],
    defaultBlockedActions: ["modify tracking code", "delete data", "change account settings", "add users"],
    requiresApprovalDefault: false,
    exampleResource: "analytics.google.com"
  },
  {
    id: "read_code",
    label: "Read code repository",
    category: "data_access",
    description: "Read files, commits, and pull requests from a code repository.",
    defaultAction: "access_data",
    defaultAllowedActions: ["read files", "view commits", "list pull requests", "check CI status"],
    defaultBlockedActions: ["push code", "merge pull requests", "delete branches", "modify repository settings"],
    requiresApprovalDefault: false,
    exampleResource: "github.com"
  },
  {
    id: "write_code",
    label: "Write code and open PRs",
    category: "content",
    description: "Create branches, commit code changes, and open pull requests.",
    defaultAction: "create_content",
    defaultAllowedActions: ["create branch", "commit changes", "open pull request", "add review comments"],
    defaultBlockedActions: ["merge to main", "delete branches", "force push", "modify repository settings"],
    requiresApprovalDefault: true,
    exampleResource: "github.com"
  },
  {
    id: "deploy_staging",
    label: "Deploy to staging",
    category: "admin",
    description: "Allow the agent to deploy to staging and preview environments without approval.",
    defaultAction: "deploy",
    defaultAllowedActions: ["deploy to staging", "create preview deployment", "update environment variables on staging"],
    defaultBlockedActions: ["deploy to production", "promote to production", "delete production deployment", "modify production env vars"],
    requiresApprovalDefault: false,
    exampleResource: "vercel.com"
  },
  {
    id: "deploy_production",
    label: "Deploy to production (approval required)",
    category: "admin",
    description: "Require human approval before the agent can promote a build to production.",
    defaultAction: "deploy_production",
    defaultAllowedActions: ["promote staging to production"],
    defaultBlockedActions: ["rollback without approval", "delete production deployment", "modify production env vars"],
    requiresApprovalDefault: true,
    exampleResource: "vercel.com"
  },
  {
    id: "read_finance",
    label: "Read financial data",
    category: "data_access",
    description: "Read invoices, transactions, and financial reports without making changes.",
    defaultAction: "access_data",
    defaultAllowedActions: ["view invoices", "read reports", "check balances", "export statements"],
    defaultBlockedActions: ["create charges", "issue refunds", "modify payment methods", "cancel subscriptions"],
    requiresApprovalDefault: false,
    exampleResource: "quickbooks.com"
  },
  {
    id: "read_monitoring",
    label: "Read monitoring and logs",
    category: "data_access",
    description: "Read application logs, error reports, and system health metrics.",
    defaultAction: "access_data",
    defaultAllowedActions: ["read logs", "view errors", "check metrics", "query alerts"],
    defaultBlockedActions: ["modify alert rules", "delete logs", "change monitoring config", "silence alerts"],
    requiresApprovalDefault: false,
    exampleResource: "datadog.com"
  },
  {
    id: "read_tickets",
    label: "Read support tickets",
    category: "data_access",
    description: "Read and summarize customer support tickets and conversations.",
    defaultAction: "access_data",
    defaultAllowedActions: ["read tickets", "view conversations", "search tickets", "summarize issues"],
    defaultBlockedActions: ["close tickets", "delete tickets", "modify customer data", "issue refunds"],
    requiresApprovalDefault: false,
    exampleResource: "zendesk.com"
  },
  {
    id: "update_tickets",
    label: "Update support tickets",
    category: "admin",
    description: "Reply to and update the status of customer support tickets.",
    defaultAction: "create_content",
    defaultAllowedActions: ["add internal notes", "update ticket status", "assign to team", "reply to customer"],
    defaultBlockedActions: ["delete tickets", "modify billing", "issue refunds", "close customer account"],
    requiresApprovalDefault: true,
    exampleResource: "zendesk.com"
  },
  {
    id: "manage_tasks",
    label: "Manage tasks",
    category: "admin",
    description: "Create and update tasks in project management tools.",
    defaultAction: "access_data",
    defaultAllowedActions: ["read tasks", "create tasks", "update task status", "add comments"],
    defaultBlockedActions: ["delete tasks", "modify project settings", "invite members", "export all data"],
    requiresApprovalDefault: false,
    exampleResource: "linear.app"
  },
  {
    id: "post_social",
    label: "Post to social media",
    category: "communication",
    description: "Draft and publish posts to social media accounts.",
    defaultAction: "create_content",
    defaultAllowedActions: ["draft posts", "schedule posts", "reply to comments", "view analytics"],
    defaultBlockedActions: ["delete account", "change privacy settings", "follow or unfollow accounts", "send direct messages"],
    requiresApprovalDefault: true,
    exampleResource: "twitter.com"
  },
  {
    id: "send_notifications",
    label: "Send notifications",
    category: "communication",
    description: "Send push notifications or SMS messages to users.",
    defaultAction: "send_message",
    defaultAllowedActions: ["send push notification", "send SMS", "schedule notification"],
    defaultBlockedActions: ["bulk message all users", "modify notification settings", "access user PII", "unsubscribe users"],
    requiresApprovalDefault: true,
    exampleResource: "twilio.com"
  },
  {
    id: "book_travel",
    label: "Book travel",
    category: "commerce",
    description: "Search and book flights, hotels, and transportation within defined limits.",
    defaultAction: "purchase",
    defaultAllowedActions: ["search flights", "search hotels", "book within budget", "cancel reservations"],
    defaultBlockedActions: ["book business class without approval", "exceed budget limit", "add unauthorized travelers", "modify loyalty accounts"],
    requiresApprovalDefault: true,
    exampleResource: "expedia.com"
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
    id: "coding_agent_local",
    label: "Coding agent: safe local dev",
    category: "developer",
    description: "Read and write project files, run tests and linting. Blocks pushes, deploys, and credential access.",
    defaultAction: "create_content",
    defaultAllowedActions: ["read files", "write files", "run tests", "run linter", "install packages"],
    defaultBlockedActions: ["delete directories recursively", "push to remote repository", "deploy to any environment", "read .env files"],
    requiresApprovalDefault: false,
    exampleResource: "local-filesystem"
  },
  {
    id: "coding_agent_staging",
    label: "Coding agent: staging deploy",
    category: "developer",
    description: "Deploy to staging and preview environments without approval. Production is blocked.",
    defaultAction: "deploy",
    defaultAllowedActions: ["deploy to staging", "create preview deployment", "update staging environment variables"],
    defaultBlockedActions: ["deploy to production", "promote to production", "delete production deployment", "modify production environment variables"],
    requiresApprovalDefault: false,
    exampleResource: "staging"
  },
  {
    id: "coding_agent_production",
    label: "Coding agent: production deploy (approval required)",
    category: "developer",
    description: "Promote staging builds to production only after human approval. Rollbacks also require sign-off.",
    defaultAction: "deploy_production",
    defaultAllowedActions: ["promote staging build to production"],
    defaultBlockedActions: ["rollback without approval", "delete production deployment", "modify production environment variables"],
    requiresApprovalDefault: true,
    exampleResource: "production"
  },
  {
    id: "github_read_issues",
    label: "GitHub: read issues, no merge",
    category: "developer",
    description: "Read issues, PRs, comments, and CI status. Blocks merging, pushing, branch deletion, and settings changes.",
    defaultAction: "access_data",
    defaultAllowedActions: ["read issues", "read pull requests", "read comments", "search repository", "check CI status"],
    defaultBlockedActions: ["merge pull requests", "push code", "delete branches", "create releases", "modify repository settings"],
    requiresApprovalDefault: false,
    exampleResource: "github.com"
  },
  {
    id: "filesystem_safe",
    label: "Filesystem: read/write, no recursive delete",
    category: "developer",
    description: "Read and write files within the project. Blocks rm -rf, deletion outside project root, and node_modules wipes.",
    defaultAction: "create_content",
    defaultAllowedActions: ["read files", "write files", "create directories", "rename files", "move files within project"],
    defaultBlockedActions: ["delete directories recursively", "rm -rf", "delete outside project root", "remove node_modules recursively"],
    requiresApprovalDefault: false,
    exampleResource: "local-filesystem"
  },
  {
    id: "database_read_only",
    label: "Database: read queries only",
    category: "developer",
    description: "Run SELECT queries and read schema. Blocks migrations, ALTER TABLE, DROP, DELETE without WHERE.",
    defaultAction: "access_data",
    defaultAllowedActions: ["run SELECT queries", "read records", "view schema", "explain query plan"],
    defaultBlockedActions: ["run migrations", "ALTER TABLE", "DROP TABLE", "DELETE without WHERE clause", "TRUNCATE"],
    requiresApprovalDefault: false,
    exampleResource: "database"
  },
  {
    id: "database_migrations",
    label: "Database: migrations (approval required)",
    category: "developer",
    description: "Apply schema migrations only after human approval. DROP and TRUNCATE always blocked.",
    defaultAction: "deploy",
    defaultAllowedActions: ["run migration", "apply schema change"],
    defaultBlockedActions: ["DROP DATABASE", "DELETE all records", "TRUNCATE without approval"],
    requiresApprovalDefault: true,
    exampleResource: "database"
  },
  {
    id: "stripe_test_mode",
    label: "Stripe: test mode only",
    category: "developer",
    description: "Use Stripe test-mode keys freely. Live API key access and real charges are blocked.",
    defaultAction: "access_data",
    defaultAllowedActions: ["create test charges", "create test customers", "list test transactions", "read test invoices"],
    defaultBlockedActions: ["use live API key", "charge real payment methods", "issue live refunds", "modify live subscriptions"],
    requiresApprovalDefault: false,
    exampleResource: "stripe.com/test"
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
  developer: "Developer",
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
