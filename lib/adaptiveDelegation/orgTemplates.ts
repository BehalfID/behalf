import type { ProfilePermissionInput } from "@/lib/permissionProfiles";
import { deriveProfileAuthority } from "@/lib/permissionProfiles";
import {
  TRUST_PROFILE_TEMPLATES,
  actionMatchesProfileSlot,
  type TrustProfilePermission,
  type TrustProfileTemplate
} from "@/lib/adaptiveDelegation/trustProfiles";

/**
 * Stage 6 organization delegation templates.
 *
 * Account-scoped authority bundles. Applying always creates a PermissionProfile
 * then applies it to explicitly selected agents — never fleet-wide silently.
 */

export type OrgDelegationTemplateId =
  | "engineering"
  | "finance"
  | "security"
  | "cicd"
  | "contractors";

export type OrgDelegationTemplate = {
  id: OrgDelegationTemplateId;
  name: string;
  description: string;
  department: string;
  /** Minimum workspace authority required to accept this org recommendation. */
  minAcceptAuthorityLevel: number;
  permissions: TrustProfilePermission[];
  /**
   * Optional trust-profile ids whose matchActions also count toward coverage
   * (Engineering aligns with Software Engineer slots).
   */
  relatedTrustProfileIds?: string[];
};

export const ORG_DELEGATION_TEMPLATES: OrgDelegationTemplate[] = [
  {
    id: "engineering",
    name: "Engineering",
    description:
      "Organization-wide engineering defaults: repo/PR collaboration without production deploy or secrets write. Elevated actions keep approval gates.",
    department: "Engineering",
    minAcceptAuthorityLevel: 80,
    relatedTrustProfileIds: ["software_engineer"],
    permissions: [
      {
        action: "repo.read",
        resource: "github",
        requiresApproval: false,
        notes: "Org template: Engineering",
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
        notes: "Shell remains approval-gated for Engineering org template.",
        matchActions: ["execute_command"]
      },
      {
        action: "deploy.production",
        resource: "production",
        requiresApproval: true,
        matchActions: ["deploy.production", "deploy_production", "deploy"]
      }
    ]
  },
  {
    id: "finance",
    name: "Finance",
    description:
      "Finance org defaults: read financial data and create reports. Billing vendor APIs and purchases stay approval-gated.",
    department: "Finance",
    minAcceptAuthorityLevel: 80,
    permissions: [
      {
        action: "access_data",
        resource: "finance",
        requiresApproval: false,
        matchActions: ["access_data"]
      },
      {
        action: "create_content",
        resource: "finance",
        requiresApproval: false,
        matchActions: ["create_content"]
      },
      {
        action: "purchase",
        requiresApproval: true,
        notes: "Purchases remain approval-gated.",
        matchActions: ["purchase"]
      },
      {
        action: "billing.vendor_api",
        resource: "billing",
        requiresApproval: true,
        matchActions: ["billing.vendor_api", "billing_vendor_api"]
      }
    ]
  },
  {
    id: "security",
    name: "Security",
    description:
      "Security org defaults: audit-oriented reads. Secrets write and production changes stay approval-gated or blocked.",
    department: "Security",
    minAcceptAuthorityLevel: 100,
    permissions: [
      {
        action: "repo.read",
        resource: "github",
        requiresApproval: false,
        matchActions: ["repo.read", "repo_read"]
      },
      {
        action: "read_file",
        requiresApproval: false,
        matchActions: ["read_file"]
      },
      {
        action: "access_data",
        requiresApproval: false,
        matchActions: ["access_data"]
      },
      {
        action: "secrets.read",
        requiresApproval: true,
        notes: "Secrets read remains approval-gated.",
        matchActions: ["secrets.read", "secrets_read"]
      },
      {
        action: "secrets.write",
        requiresApproval: true,
        blockedActions: ["write .env", "rotate production secrets without approval"],
        notes: "Secrets write remains approval-gated.",
        matchActions: ["secrets.write", "secrets_write"]
      }
    ]
  },
  {
    id: "cicd",
    name: "CI/CD",
    description:
      "CI/CD org defaults: staging/preview deploys and dependency updates. Production deploy stays approval-gated.",
    department: "CI/CD",
    minAcceptAuthorityLevel: 80,
    permissions: [
      {
        action: "deploy",
        resource: "staging",
        requiresApproval: false,
        allowedActions: ["deploy to staging", "create preview deployment"],
        blockedActions: ["deploy to production"],
        matchActions: ["deploy", "deploy.staging", "deploy_staging"]
      },
      {
        action: "dependency.update",
        resource: "staging",
        requiresApproval: false,
        matchActions: ["dependency.update", "dependency_update"]
      },
      {
        action: "execute_command",
        requiresApproval: true,
        notes: "CI shell remains approval-gated by default.",
        matchActions: ["execute_command"]
      },
      {
        action: "deploy.production",
        resource: "production",
        requiresApproval: true,
        matchActions: ["deploy.production", "deploy_production"]
      }
    ]
  },
  {
    id: "contractors",
    name: "Contractors",
    description:
      "Contractor org defaults: read-only collaboration with approval on writes, email, and elevated tools.",
    department: "Contractors",
    minAcceptAuthorityLevel: 80,
    relatedTrustProfileIds: ["research_assistant"],
    permissions: [
      {
        action: "repo.read",
        resource: "github",
        requiresApproval: false,
        matchActions: ["repo.read", "repo_read"]
      },
      {
        action: "github.issue.read",
        resource: "github",
        requiresApproval: false,
        matchActions: ["github.issue.read"]
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
        action: "create_content",
        requiresApproval: true,
        notes: "Content creation remains approval-gated for contractors.",
        matchActions: ["create_content"]
      },
      {
        action: "send_email",
        requiresApproval: true,
        matchActions: ["send_email"]
      },
      {
        action: "execute_command",
        requiresApproval: true,
        matchActions: ["execute_command"]
      }
    ]
  }
];

/** Sentinel agentId stored on org-scoped Adaptive Delegation recommendations. */
export const ORG_RECOMMENDATION_AGENT_ID = "__org__";

export function getOrgDelegationTemplate(id: string): OrgDelegationTemplate | null {
  return ORG_DELEGATION_TEMPLATES.find((template) => template.id === id) ?? null;
}

export function orgTemplateAuthorityLevel(template: OrgDelegationTemplate): number {
  return Math.max(template.minAcceptAuthorityLevel, deriveProfileAuthority(template.permissions));
}

export function toOrgProfilePermissionInputs(
  template: OrgDelegationTemplate
): ProfilePermissionInput[] {
  return template.permissions.map(({ matchActions: _matchActions, ...permission }) => permission);
}

export function orgTemplateMatchSlots(template: OrgDelegationTemplate): TrustProfilePermission[] {
  const related = (template.relatedTrustProfileIds ?? [])
    .map((id) => TRUST_PROFILE_TEMPLATES.find((item) => item.id === id))
    .filter((item): item is TrustProfileTemplate => Boolean(item))
    .flatMap((item) => item.permissions);

  // Prefer org template slots; related trust slots fill additional matchActions only.
  const byAction = new Map<string, TrustProfilePermission>();
  for (const slot of [...related, ...template.permissions]) {
    byAction.set(slot.action, slot);
  }
  return [...byAction.values()];
}

export { actionMatchesProfileSlot };
