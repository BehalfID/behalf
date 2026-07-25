import type { ProfilePermissionInput } from "@/lib/permissionProfiles";
import { deriveProfileAuthority } from "@/lib/permissionProfiles";

/**
 * Stage 4 trust profile templates.
 *
 * These are advisory bundles only. Applying a profile always goes through
 * createPermissionProfile + applyPermissionProfile after explicit human acceptance.
 */

export type TrustProfileTemplateId =
  | "software_engineer"
  | "data_analyst"
  | "research_assistant"
  | "customer_support";

export type TrustProfilePermission = ProfilePermissionInput & {
  /** Actions in approval history that count toward matching this slot. */
  matchActions: string[];
};

export type TrustProfileTemplate = {
  id: TrustProfileTemplateId;
  name: string;
  description: string;
  /** Default resource scope hint shown in recommendations. */
  resourceScope: string;
  permissions: TrustProfilePermission[];
};

export const TRUST_PROFILE_TEMPLATES: TrustProfileTemplate[] = [
  {
    id: "software_engineer",
    name: "Software Engineer",
    description:
      "Read repositories and collaborate on PRs without deploy, secrets, or production write access. Elevated actions keep approval gates.",
    resourceScope: "engineering repositories",
    permissions: [
      {
        action: "repo.read",
        resource: "github",
        requiresApproval: false,
        notes: "Trust profile: Software Engineer",
        matchActions: ["repo.read", "repo_read", "github.pr.read"]
      },
      {
        action: "github.issue.read",
        resource: "github",
        requiresApproval: false,
        matchActions: ["github.issue.read", "github_issue_read"]
      },
      {
        action: "github.pr.comment",
        resource: "github",
        requiresApproval: false,
        matchActions: ["github.pr.comment", "github_pr_comment"]
      },
      {
        action: "read_file",
        requiresApproval: false,
        matchActions: ["read_file"]
      },
      {
        action: "execute_command",
        requiresApproval: true,
        notes: "Shell remains approval-gated under Software Engineer.",
        matchActions: ["execute_command"]
      },
      {
        action: "deploy.production",
        resource: "production",
        requiresApproval: true,
        blockedActions: ["deploy to production without approval"],
        notes: "Production deploy stays approval-gated.",
        matchActions: ["deploy.production", "deploy_production", "deploy"]
      }
    ]
  },
  {
    id: "data_analyst",
    name: "Data Analyst",
    description:
      "Read datasets and create analysis content. Destructive database and production migrate actions stay blocked or approval-gated.",
    resourceScope: "analytics datasets",
    permissions: [
      {
        action: "access_data",
        requiresApproval: false,
        matchActions: ["access_data"]
      },
      {
        action: "create_content",
        requiresApproval: false,
        matchActions: ["create_content"]
      },
      {
        action: "read_file",
        requiresApproval: false,
        matchActions: ["read_file"]
      },
      {
        action: "browse_web",
        requiresApproval: false,
        matchActions: ["browse_web"]
      },
      {
        action: "database.migrate.production",
        resource: "production",
        requiresApproval: true,
        blockedActions: ["drop table", "drop database", "truncate table"],
        notes: "Production DB changes remain approval-gated.",
        matchActions: ["database.migrate.production", "database_migrate_production"]
      }
    ]
  },
  {
    id: "research_assistant",
    name: "Research Assistant",
    description:
      "Browse, read, and summarize content. No deploy, secrets, or billing access.",
    resourceScope: "research materials",
    permissions: [
      {
        action: "browse_web",
        requiresApproval: false,
        matchActions: ["browse_web"]
      },
      {
        action: "access_data",
        requiresApproval: false,
        matchActions: ["access_data"]
      },
      {
        action: "create_content",
        requiresApproval: false,
        matchActions: ["create_content"]
      },
      {
        action: "read_file",
        requiresApproval: false,
        matchActions: ["read_file"]
      },
      {
        action: "send_email",
        requiresApproval: true,
        notes: "Outbound email stays approval-gated.",
        matchActions: ["send_email"]
      }
    ]
  },
  {
    id: "customer_support",
    name: "Customer Support",
    description:
      "Read tickets and draft replies. Billing vendor APIs and workspace admin stay approval-gated or blocked.",
    resourceScope: "support tickets",
    permissions: [
      {
        action: "access_data",
        resource: "support",
        requiresApproval: false,
        matchActions: ["access_data"]
      },
      {
        action: "create_content",
        resource: "support",
        requiresApproval: false,
        matchActions: ["create_content"]
      },
      {
        action: "send_email",
        requiresApproval: true,
        notes: "Customer email remains approval-gated.",
        matchActions: ["send_email"]
      },
      {
        action: "billing.vendor_api",
        resource: "billing",
        requiresApproval: true,
        notes: "Billing APIs remain approval-gated.",
        matchActions: ["billing.vendor_api", "billing_vendor_api"]
      }
    ]
  }
];

export function getTrustProfileTemplate(id: string): TrustProfileTemplate | null {
  return TRUST_PROFILE_TEMPLATES.find((template) => template.id === id) ?? null;
}

export function trustProfileAuthorityLevel(template: TrustProfileTemplate): number {
  return deriveProfileAuthority(template.permissions);
}

export function toProfilePermissionInputs(
  template: TrustProfileTemplate
): ProfilePermissionInput[] {
  return template.permissions.map(({ matchActions: _matchActions, ...permission }) => permission);
}

export function normalizeActionKey(action: string): string {
  return action.trim().toLowerCase().replace(/\s+/g, "_");
}

/** True when a historical approval action matches a profile permission slot. */
export function actionMatchesProfileSlot(action: string, slot: TrustProfilePermission): boolean {
  const normalized = normalizeActionKey(action);
  if (normalizeActionKey(slot.action) === normalized) return true;
  return slot.matchActions.some((candidate) => normalizeActionKey(candidate) === normalized);
}
