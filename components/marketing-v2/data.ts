/* Typed local demo data for the canonical marketing homepage.
   All content is illustrative and grounded in the BehalfID product model
   (agents, scoped permissions, approval gates, verification logs). */

export type DecisionState = "allowed" | "denied" | "approval";

export interface DecisionScenario {
  state: DecisionState;
  tabLabel: string;
  agent: string;
  action: string;
  vendor: string;
  resource: string;
  amount?: string;
  verdict: string;
  requiredAuthority?: string;
  requestedBy?: string;
  policy: string;
  reason: string;
}

export const HERO_SCENARIOS: DecisionScenario[] = [
  {
    state: "approval",
    tabLabel: "Approval",
    agent: "claude-code-production",
    action: "stripe.refunds.create",
    vendor: "Stripe",
    resource: "payment_intent_3N8x...",
    amount: "$8,400.00",
    verdict: "approval required",
    requiredAuthority: "Engineering Lead",
    requestedBy: "deployment-agent",
    policy: "Production Finance Controls",
    reason:
      "Refunds above the auto-approve threshold pause for a human with Engineering Lead authority. The action does not run until it is approved."
  },
  {
    state: "allowed",
    tabLabel: "Allowed",
    agent: "claude-code-production",
    action: "vercel.deployments.create",
    vendor: "Vercel",
    resource: "project: marketing-site (staging)",
    verdict: "allowed",
    policy: "Production Deployment Agent",
    reason:
      "Staging deploys are within the agent's scoped permissions. The action is allowed and recorded in the verification log."
  },
  {
    state: "denied",
    tabLabel: "Denied",
    agent: "claude-code-production",
    action: "github.repositories.delete",
    vendor: "GitHub",
    resource: "company/identity-service",
    verdict: "denied",
    policy: "Production Deployment Agent",
    reason:
      "Repository deletion is on the agent's blocked-actions list. Deny rules take precedence, so the action never executes."
  }
];

export const TRUST_ITEMS = [
  { title: "Fail-closed enforcement" },
  { title: "Human approval gates" },
  { title: "Scoped agent permissions" },
  { title: "Auditable decision records" }
] as const;

export const PROBLEMS = [
  {
    num: "01",
    title: "API keys are too broad",
    text: "A single key often grants far more than the task needs. The agent can do anything the key can do."
  },
  {
    num: "02",
    title: "Agent tools inherit power",
    text: "Coding assistants and workflows run with the permissions of whoever configured them — usually an admin."
  },
  {
    num: "03",
    title: "Monitoring comes too late",
    text: "Dashboards and alerts describe what already happened. By then the deploy shipped or the refund cleared."
  },
  {
    num: "04",
    title: "Prompts are not enforcement",
    text: "Instructions in a system prompt are guidance, not a control. They can be ignored, overridden, or forgotten."
  }
] as const;

export const HOW_IT_WORKS = [
  {
    num: "01",
    title: "Identify the agent",
    text: "Every AI agent, coding assistant, workflow, or autonomous service gets its own distinct identity.",
    chips: ["claude-code", "codex", "finance-agent", "deployment-agent", "internal-automation"]
  },
  {
    num: "02",
    title: "Define its authority",
    text: "Set allowed and blocked actions, vendors, resources, paths, commands, transaction limits, and required authority levels.",
    chips: ["allowed actions", "blocked actions", "resources", "transaction limits", "required authority"]
  },
  {
    num: "03",
    title: "Verify every action",
    text: "BehalfID evaluates each attempted action and returns allow, deny, or approval required — and records the outcome.",
    chips: ["allowed", "denied", "approval required", "audit log"]
  }
] as const;

export const APPROVAL_INBOX = [
  {
    agent: "deployment-agent",
    action: "stripe.refunds.create",
    requester: "deployment-agent",
    resource: "payment_intent_3N8x...",
    amount: "$8,400.00",
    authority: "Engineering Lead",
    state: "approval" as const
  },
  {
    agent: "claude-code-production",
    action: "vercel.deployments.create · production",
    requester: "claude-code-production",
    resource: "project: payments-api",
    amount: "—",
    authority: "Engineering Lead",
    state: "approval" as const
  }
];

export interface LogEntry {
  state: "allowed" | "denied" | "approval" | "neutral";
  action: string;
  agent: string;
  detail: string;
  time: string;
}

export const LOG_ENTRIES: LogEntry[] = [
  {
    state: "allowed",
    action: "vercel.deployments.create",
    agent: "claude-code-production",
    detail: "staging · allowed",
    time: "just now"
  },
  {
    state: "denied",
    action: "github.repositories.delete",
    agent: "claude-code-production",
    detail: "blocked action",
    time: "2m ago"
  },
  {
    state: "approval",
    action: "stripe.refunds.create",
    agent: "deployment-agent",
    detail: "approval required · $8,400",
    time: "6m ago"
  },
  {
    state: "neutral",
    action: "permission.revoked",
    agent: "finance-agent",
    detail: "grant expired",
    time: "18m ago"
  },
  {
    state: "denied",
    action: "shell.exec · rm -rf",
    agent: "codex-sandbox",
    detail: "constraint mismatch",
    time: "24m ago"
  }
];

export interface DevIntegration {
  id: string;
  label: string;
  codeLabel: string;
  href: string;
  code: { type: "comment" | "keyword" | "string" | "fn" | "plain"; text: string }[][];
}

export const DEV_INTEGRATIONS: DevIntegration[] = [
  {
    id: "sdk",
    label: "JavaScript SDK",
    codeLabel: "enforce.ts",
    href: "/docs/sdk",
    code: [
      [{ type: "keyword", text: "import" }, { type: "plain", text: " { BehalfID } " }, { type: "keyword", text: "from" }, { type: "string", text: " \"@behalfid/sdk\"" }, { type: "plain", text: ";" }],
      [],
      [{ type: "keyword", text: "const" }, { type: "plain", text: " behalf = " }, { type: "keyword", text: "new" }, { type: "fn", text: " BehalfID" }, { type: "plain", text: "({ apiKey });" }],
      [],
      [{ type: "comment", text: "// Ask BehalfID before the agent executes" }],
      [{ type: "keyword", text: "const" }, { type: "plain", text: " decision = " }, { type: "keyword", text: "await" }, { type: "plain", text: " behalf." }, { type: "fn", text: "verify" }, { type: "plain", text: "({" }],
      [{ type: "plain", text: "  agentId: " }, { type: "string", text: "\"agent_claude_code\"" }, { type: "plain", text: "," }],
      [{ type: "plain", text: "  action:  " }, { type: "string", text: "\"stripe.refunds.create\"" }, { type: "plain", text: "," }],
      [{ type: "plain", text: "  vendor:  " }, { type: "string", text: "\"stripe.com\"" }, { type: "plain", text: "," }],
      [{ type: "plain", text: "});" }],
      [],
      [{ type: "keyword", text: "if" }, { type: "plain", text: " (!decision.allowed) {" }],
      [{ type: "plain", text: "  " }, { type: "keyword", text: "throw new" }, { type: "fn", text: " Error" }, { type: "plain", text: "(decision.reason);" }],
      [{ type: "plain", text: "}" }],
      [{ type: "comment", text: "// runs only when decision.allowed === true" }]
    ]
  },
  {
    id: "cli",
    label: "CLI",
    codeLabel: "terminal",
    href: "/docs/cli",
    code: [
      [{ type: "comment", text: "# Scope what the agent may do" }],
      [{ type: "plain", text: "behalf permissions create agent_xxx \\" }],
      [{ type: "plain", text: "  --action vercel.deployments.create \\" }],
      [{ type: "plain", text: "  --resource vercel.com \\" }],
      [{ type: "plain", text: "  --blocked \"deploy to production\"" }],
      [],
      [{ type: "comment", text: "# Require approval for production" }],
      [{ type: "plain", text: "behalf permissions create agent_xxx \\" }],
      [{ type: "plain", text: "  --action deploy_production \\" }],
      [{ type: "plain", text: "  --requires-approval" }]
    ]
  },
  {
    id: "mcp",
    label: "MCP",
    codeLabel: "terminal",
    href: "/docs/cli",
    code: [
      [{ type: "comment", text: "# Wire enforcement into the agent's tools" }],
      [{ type: "plain", text: "behalf mcp init" }],
      [],
      [{ type: "comment", text: "# Writes .mcp.json + agent context so tool" }],
      [{ type: "comment", text: "# calls are verified at the MCP boundary —" }],
      [{ type: "comment", text: "# not inside the model's memory." }],
      [{ type: "plain", text: "behalf claude" }]
    ]
  },
  {
    id: "api",
    label: "API",
    codeLabel: "request",
    href: "/docs/api",
    code: [
      [{ type: "plain", text: "POST /api/v1/verify" }],
      [{ type: "plain", text: "Authorization: Bearer $BEHALFID_API_KEY" }],
      [],
      [{ type: "plain", text: "{" }],
      [{ type: "plain", text: "  " }, { type: "string", text: "\"agentId\"" }, { type: "plain", text: ": " }, { type: "string", text: "\"agent_claude_code\"" }, { type: "plain", text: "," }],
      [{ type: "plain", text: "  " }, { type: "string", text: "\"action\"" }, { type: "plain", text: ":  " }, { type: "string", text: "\"github.repositories.delete\"" }, { type: "plain", text: "," }],
      [{ type: "plain", text: "  " }, { type: "string", text: "\"vendor\"" }, { type: "plain", text: ":  " }, { type: "string", text: "\"github.com\"" }],
      [{ type: "plain", text: "}" }],
      [],
      [{ type: "comment", text: "// → { allowed: false, decision: \"denied\", ... }" }]
    ]
  }
];

export const ENTERPRISE_FEATURES = [
  {
    icon: "building",
    title: "Centralized governance",
    text: "Manage identities, permissions, and approvals from one workspace."
  },
  {
    icon: "route",
    title: "Delegated authority",
    text: "Assign who can define policy and approve sensitive requests."
  },
  {
    icon: "lock",
    title: "Protected resources",
    text: "Place production systems and repositories behind explicit controls."
  },
  {
    icon: "list",
    title: "Auditable decisions",
    text: "Retain the evidence behind every allow, deny, and approval."
  }
] as const;

export const PRINCIPLES = [
  { title: "Fail closed", text: "When authorization cannot be determined safely, the action is denied." },
  { title: "Deny takes precedence", text: "A blocked action overrides any allow rule that would otherwise match." },
  { title: "Self-approval is blocked", text: "A requester cannot approve their own request. Authority must come from someone else." },
  { title: "Approval binds to the action", text: "A grant applies to the specific intended action — not to a broad class of future actions." },
  { title: "Grants expire", text: "Revoked and expired permissions are rejected at verification time." },
  { title: "Every decision is auditable", text: "Allow, deny, and approval outcomes are all recorded with a stable request ID." }
] as const;

export const COMPARISON = [
  { label: "Monitoring", text: "Sees what happened after execution.", timing: "After the fact", active: false },
  { label: "Prompt filtering", text: "Attempts to detect unsafe intent in input or output.", timing: "Best effort", active: false },
  { label: "Credential management", text: "Controls which secret or account can be accessed.", timing: "Access only", active: false },
  {
    label: "BehalfID",
    text: "Determines whether a specific agent has authority to perform a specific action.",
    timing: "Before execution",
    active: true
  }
] as const;

export const FOOTER_LINKS = [
  { label: "Documentation", href: "/docs" },
  { label: "Security", href: "/security" },
  { label: "Status", href: "/status" },
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
  { label: "Contact", href: "mailto:support@behalfid.com" }
] as const;
