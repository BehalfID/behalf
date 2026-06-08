export type PolicyPermission = {
  action: string;
  resource: string;
  allowedActions: string[];
  blockedActions: string[];
  requiresApproval: boolean;
  notes?: string;
  constraints?: { maxAmount?: number; allowedVendors?: string[] };
};

export type PolicyTemplateCategory =
  | "coding_agent"
  | "vcs"
  | "filesystem"
  | "database"
  | "payment"
  | "communication"
  | "browser";

export type PolicyTemplate = {
  id: string;
  label: string;
  tagline: string;
  description: string;
  category: PolicyTemplateCategory;
  permissions: PolicyPermission[];
  blocks: string[];
};

export const POLICY_TEMPLATES: PolicyTemplate[] = [
  {
    id: "coding_agent_local",
    label: "Coding agent: safe local dev",
    tagline: "Read and write project files. Cannot push to remote or deploy.",
    description:
      "Allows a coding agent to read files, write code, run tests, and install packages inside the project. Prevents pushing to remote repositories, deploying, or reading credential files.",
    category: "coding_agent",
    permissions: [
      {
        action: "create_content",
        resource: "local-filesystem",
        allowedActions: [
          "read files",
          "write files",
          "create directories",
          "run tests",
          "run linter",
          "install packages"
        ],
        blockedActions: [
          "delete directories recursively",
          "push to remote repository",
          "deploy to any environment",
          "read .env files",
          "read credentials files",
          "run git push"
        ],
        requiresApproval: false,
        notes: "Local-only coding agent. Push and deploy require separate permissions."
      }
    ],
    blocks: [
      "Recursive directory deletion",
      "Remote pushes",
      "Deployments",
      "Credential and .env file access"
    ]
  },
  {
    id: "coding_agent_deploy",
    label: "Coding agent: staging free, production gated",
    tagline: "Staging deploys are automatic. Production requires your approval.",
    description:
      "Creates two permissions: the agent may deploy to staging and preview environments freely, but any promotion to production requires human approval via BehalfID.",
    category: "coding_agent",
    permissions: [
      {
        action: "deploy",
        resource: "staging",
        allowedActions: [
          "deploy to staging",
          "create preview deployment",
          "update staging environment variables"
        ],
        blockedActions: [
          "deploy to production",
          "promote to production",
          "delete production deployment",
          "modify production environment variables"
        ],
        requiresApproval: false,
        notes: "Staging and preview environments only."
      },
      {
        action: "deploy_production",
        resource: "production",
        allowedActions: ["promote staging build to production"],
        blockedActions: [
          "rollback without approval",
          "delete production deployment",
          "modify production environment variables"
        ],
        requiresApproval: true,
        notes: "Human approval required before any production promotion."
      }
    ],
    blocks: [
      "Unreviewed production deploys",
      "Production rollbacks without approval",
      "Production environment variable changes"
    ]
  },
  {
    id: "github_read_issues",
    label: "GitHub: read issues, cannot merge",
    tagline: "Read issues and PRs. Cannot push, merge, or delete branches.",
    description:
      "Allows the agent to read GitHub issues, pull requests, comments, and CI status. Explicitly blocks merging PRs, pushing code, deleting branches, and modifying repository settings.",
    category: "vcs",
    permissions: [
      {
        action: "access_data",
        resource: "github.com",
        allowedActions: [
          "read issues",
          "read pull requests",
          "read comments",
          "search repository",
          "check CI status",
          "list branches",
          "read file contents"
        ],
        blockedActions: [
          "merge pull requests",
          "push code",
          "delete branches",
          "create releases",
          "modify repository settings",
          "add or remove collaborators",
          "force push"
        ],
        requiresApproval: false,
        notes: "Read-only GitHub access. No write or merge operations."
      }
    ],
    blocks: [
      "PR merges",
      "Code pushes",
      "Branch deletion",
      "Repository settings changes",
      "Release creation"
    ]
  },
  {
    id: "filesystem_safe",
    label: "Filesystem: read/write, no recursive delete",
    tagline: "Read and write project files. Cannot delete directories recursively.",
    description:
      "Allows the agent to read and write files within the project directory. Blocks recursive directory deletion (rm -rf), deleting outside the project root, and removing node_modules.",
    category: "filesystem",
    permissions: [
      {
        action: "create_content",
        resource: "local-filesystem",
        allowedActions: [
          "read files",
          "write files",
          "create directories",
          "rename files",
          "move files within project"
        ],
        blockedActions: [
          "delete directories recursively",
          "rm -rf",
          "delete outside project root",
          "remove node_modules recursively",
          "delete hidden directories",
          "wipe entire workspace"
        ],
        requiresApproval: false,
        notes: "File read/write only. Recursive deletion always blocked."
      }
    ],
    blocks: [
      "Recursive directory deletion (rm -rf)",
      "Deletion outside project root",
      "node_modules wipe"
    ]
  },
  {
    id: "database_read",
    label: "Database: read queries, migrations gated",
    tagline: "Read queries run freely. Schema migrations require approval.",
    description:
      "Creates two permissions: the agent may run SELECT queries and read from the database without approval, but any migration, schema change, or destructive query requires human sign-off.",
    category: "database",
    permissions: [
      {
        action: "access_data",
        resource: "database",
        allowedActions: [
          "run SELECT queries",
          "read records",
          "export query results",
          "view schema",
          "explain query plan"
        ],
        blockedActions: [
          "run migrations",
          "ALTER TABLE",
          "DROP TABLE",
          "DELETE without WHERE clause",
          "TRUNCATE",
          "modify schema"
        ],
        requiresApproval: false,
        notes: "Read-only database access. No schema or data mutations."
      },
      {
        action: "deploy",
        resource: "database",
        allowedActions: ["run migration", "apply schema change"],
        blockedActions: [
          "DROP DATABASE",
          "DELETE all records",
          "TRUNCATE without approval",
          "rollback without approval"
        ],
        requiresApproval: true,
        notes: "All migrations and schema changes require human approval."
      }
    ],
    blocks: [
      "Unapproved schema migrations",
      "DROP TABLE and TRUNCATE",
      "DELETE without WHERE",
      "Unapproved rollbacks"
    ]
  },
  {
    id: "stripe_test_live",
    label: "Stripe: test mode free, live mode gated",
    tagline: "Test API keys work freely. Live charges require approval.",
    description:
      "Creates two permissions: the agent may use Stripe test-mode keys and create test charges without approval. Any live-mode charge, subscription change, or refund requires human sign-off.",
    category: "payment",
    permissions: [
      {
        action: "access_data",
        resource: "stripe.com/test",
        allowedActions: [
          "create test charges",
          "create test customers",
          "list test transactions",
          "read test invoices",
          "cancel test subscriptions"
        ],
        blockedActions: [
          "use live API key",
          "charge real payment methods",
          "issue live refunds",
          "modify live subscriptions"
        ],
        requiresApproval: false,
        notes: "Test mode only. Live API key access is blocked."
      },
      {
        action: "purchase",
        resource: "stripe.com/live",
        allowedActions: ["create live charge", "issue refund", "modify subscription"],
        blockedActions: [
          "bulk charge customers",
          "delete payment methods",
          "disable account"
        ],
        requiresApproval: true,
        notes: "All live Stripe operations require human approval."
      }
    ],
    blocks: [
      "Unapproved live charges",
      "Unapproved refunds",
      "Live subscription changes without approval",
      "Bulk billing operations"
    ]
  },
  {
    id: "email_draft_send",
    label: "Email: draft free, send gated",
    tagline: "Drafts are automatic. Sending any email requires your approval.",
    description:
      "Creates two permissions: the agent may compose and save email drafts without approval, but actually sending any email requires explicit human sign-off via BehalfID.",
    category: "communication",
    permissions: [
      {
        action: "create_content",
        resource: "email",
        allowedActions: [
          "draft email",
          "save draft",
          "read inbox",
          "read sent messages",
          "search email"
        ],
        blockedActions: [
          "send email",
          "forward email",
          "reply to external addresses",
          "delete messages",
          "modify inbox rules"
        ],
        requiresApproval: false,
        notes: "Draft and read only. Sending always requires approval."
      },
      {
        action: "send_email",
        resource: "email",
        allowedActions: ["send email", "reply to thread", "forward message"],
        blockedActions: [
          "send to external mailing list",
          "bulk email",
          "send with modified from address",
          "delete sent messages"
        ],
        requiresApproval: true,
        notes: "Human approval required before any email is sent."
      }
    ],
    blocks: [
      "Unsupervised email sending",
      "Bulk email",
      "External forwarding without approval",
      "Inbox rule modifications"
    ]
  },
  {
    id: "browser_safe_purchase",
    label: "Browser: browse free, purchases gated",
    tagline: "Web browsing is automatic. Any purchase requires approval.",
    description:
      "Creates two permissions: the agent may browse websites and read content freely. Any purchase or form submission involving payment requires explicit human approval, with an optional spending threshold.",
    category: "browser",
    permissions: [
      {
        action: "browse_web",
        resource: "web",
        allowedActions: [
          "browse websites",
          "read public pages",
          "extract structured data",
          "search web",
          "follow links"
        ],
        blockedActions: [
          "submit payment forms",
          "enter credit card numbers",
          "make purchases",
          "log into accounts",
          "submit forms with personal data"
        ],
        requiresApproval: false,
        notes: "Read-only web access. No purchases or form submissions."
      },
      {
        action: "purchase",
        resource: "web",
        allowedActions: ["add to cart", "checkout", "confirm purchase"],
        blockedActions: [
          "save new payment method",
          "modify subscription",
          "purchase from unapproved vendor"
        ],
        requiresApproval: true,
        constraints: { maxAmount: 25 },
        notes: "Purchases require approval. Default cap: $25."
      }
    ],
    blocks: [
      "Unsupervised purchases",
      "Payment form submissions",
      "Account logins",
      "Purchases above threshold"
    ]
  }
];

export const POLICY_CATEGORY_LABELS: Record<PolicyTemplateCategory, string> = {
  coding_agent: "Coding agent",
  vcs: "Version control",
  filesystem: "Filesystem",
  database: "Database",
  payment: "Payment",
  communication: "Communication",
  browser: "Browser"
};

export function getPolicyTemplate(id: string): PolicyTemplate | undefined {
  return POLICY_TEMPLATES.find((t) => t.id === id);
}

export function getPolicyTemplatesByCategory(): Record<PolicyTemplateCategory, PolicyTemplate[]> {
  const result = {} as Record<PolicyTemplateCategory, PolicyTemplate[]>;
  for (const template of POLICY_TEMPLATES) {
    if (!result[template.category]) result[template.category] = [];
    result[template.category].push(template);
  }
  return result;
}
