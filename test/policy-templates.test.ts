import { describe, expect, it } from "vitest";
import {
  POLICY_TEMPLATES,
  POLICY_CATEGORY_LABELS,
  getPolicyTemplate,
  getPolicyTemplatesByCategory,
  type PolicyTemplate,
  type PolicyPermission
} from "@/lib/policyTemplates";

describe("POLICY_TEMPLATES", () => {
  it("exports exactly 8 templates", () => {
    expect(POLICY_TEMPLATES).toHaveLength(8);
  });

  it("every template has required fields", () => {
    for (const t of POLICY_TEMPLATES) {
      expect(t.id, `${t.id}.id`).toBeTruthy();
      expect(t.label, `${t.id}.label`).toBeTruthy();
      expect(t.tagline, `${t.id}.tagline`).toBeTruthy();
      expect(t.description, `${t.id}.description`).toBeTruthy();
      expect(t.category, `${t.id}.category`).toBeTruthy();
      expect(t.permissions.length, `${t.id}.permissions`).toBeGreaterThanOrEqual(1);
      expect(t.blocks.length, `${t.id}.blocks`).toBeGreaterThanOrEqual(1);
    }
  });

  it("every permission has required fields", () => {
    for (const t of POLICY_TEMPLATES) {
      for (const p of t.permissions) {
        expect(p.action, `${t.id} permission.action`).toBeTruthy();
        expect(p.resource, `${t.id} permission.resource`).toBeTruthy();
        expect(p.allowedActions.length, `${t.id} permission.allowedActions`).toBeGreaterThan(0);
        expect(p.blockedActions.length, `${t.id} permission.blockedActions`).toBeGreaterThan(0);
        expect(typeof p.requiresApproval, `${t.id} permission.requiresApproval`).toBe("boolean");
      }
    }
  });

  it("template ids are unique", () => {
    const ids = POLICY_TEMPLATES.map((t) => t.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});

describe("coding_agent_local template", () => {
  const tpl = POLICY_TEMPLATES.find((t) => t.id === "coding_agent_local")!;

  it("exists", () => expect(tpl).toBeDefined());

  it("has exactly one permission", () => {
    expect(tpl.permissions).toHaveLength(1);
  });

  it("generates correct action and resource", () => {
    const p = tpl.permissions[0];
    expect(p.action).toBe("create_content");
    expect(p.resource).toBe("local-filesystem");
  });

  it("allows read and write files", () => {
    const p = tpl.permissions[0];
    expect(p.allowedActions).toContain("read files");
    expect(p.allowedActions).toContain("write files");
  });

  it("blocks recursive deletion and remote push", () => {
    const p = tpl.permissions[0];
    expect(p.blockedActions).toContain("delete directories recursively");
    expect(p.blockedActions).toContain("push to remote repository");
  });

  it("does not require approval", () => {
    expect(tpl.permissions[0].requiresApproval).toBe(false);
  });
});

describe("coding_agent_deploy template", () => {
  const tpl = POLICY_TEMPLATES.find((t) => t.id === "coding_agent_deploy")!;

  it("exists", () => expect(tpl).toBeDefined());

  it("has exactly two permissions", () => {
    expect(tpl.permissions).toHaveLength(2);
  });

  it("staging permission does not require approval", () => {
    const staging = tpl.permissions.find((p) => p.action === "deploy")!;
    expect(staging).toBeDefined();
    expect(staging.requiresApproval).toBe(false);
    expect(staging.resource).toBe("staging");
  });

  it("production permission requires approval", () => {
    const prod = tpl.permissions.find((p) => p.action === "deploy_production")!;
    expect(prod).toBeDefined();
    expect(prod.requiresApproval).toBe(true);
    expect(prod.resource).toBe("production");
  });

  it("staging blocks production deploy", () => {
    const staging = tpl.permissions.find((p) => p.action === "deploy")!;
    expect(staging.blockedActions).toContain("deploy to production");
  });
});

describe("github_read_issues template", () => {
  const tpl = POLICY_TEMPLATES.find((t) => t.id === "github_read_issues")!;

  it("exists", () => expect(tpl).toBeDefined());

  it("has exactly one permission", () => {
    expect(tpl.permissions).toHaveLength(1);
  });

  it("generates access_data action on github.com", () => {
    const p = tpl.permissions[0];
    expect(p.action).toBe("access_data");
    expect(p.resource).toBe("github.com");
  });

  it("allows reading issues and PRs", () => {
    const p = tpl.permissions[0];
    expect(p.allowedActions).toContain("read issues");
    expect(p.allowedActions).toContain("read pull requests");
  });

  it("blocks merging PRs and pushing code", () => {
    const p = tpl.permissions[0];
    expect(p.blockedActions).toContain("merge pull requests");
    expect(p.blockedActions).toContain("push code");
  });

  it("does not require approval", () => {
    expect(tpl.permissions[0].requiresApproval).toBe(false);
  });
});

describe("filesystem_safe template", () => {
  const tpl = POLICY_TEMPLATES.find((t) => t.id === "filesystem_safe")!;

  it("exists", () => expect(tpl).toBeDefined());

  it("has exactly one permission", () => {
    expect(tpl.permissions).toHaveLength(1);
  });

  it("blocks rm -rf and recursive deletion", () => {
    const p = tpl.permissions[0];
    expect(p.blockedActions).toContain("delete directories recursively");
    expect(p.blockedActions).toContain("rm -rf");
  });

  it("allows read and write files", () => {
    const p = tpl.permissions[0];
    expect(p.allowedActions).toContain("read files");
    expect(p.allowedActions).toContain("write files");
  });
});

describe("database_read template", () => {
  const tpl = POLICY_TEMPLATES.find((t) => t.id === "database_read")!;

  it("exists", () => expect(tpl).toBeDefined());

  it("has exactly two permissions", () => {
    expect(tpl.permissions).toHaveLength(2);
  });

  it("read permission does not require approval", () => {
    const read = tpl.permissions.find((p) => p.action === "access_data")!;
    expect(read).toBeDefined();
    expect(read.requiresApproval).toBe(false);
  });

  it("migration permission requires approval", () => {
    const migration = tpl.permissions.find((p) => p.action === "deploy")!;
    expect(migration).toBeDefined();
    expect(migration.requiresApproval).toBe(true);
  });

  it("read permission blocks migrations and DROP", () => {
    const read = tpl.permissions.find((p) => p.action === "access_data")!;
    expect(read.blockedActions).toContain("run migrations");
    expect(read.blockedActions).toContain("DROP TABLE");
  });
});

describe("stripe_test_live template", () => {
  const tpl = POLICY_TEMPLATES.find((t) => t.id === "stripe_test_live")!;

  it("exists", () => expect(tpl).toBeDefined());

  it("has exactly two permissions", () => {
    expect(tpl.permissions).toHaveLength(2);
  });

  it("test mode does not require approval", () => {
    const test = tpl.permissions.find((p) => p.resource === "stripe.com/test")!;
    expect(test).toBeDefined();
    expect(test.requiresApproval).toBe(false);
  });

  it("live mode requires approval", () => {
    const live = tpl.permissions.find((p) => p.resource === "stripe.com/live")!;
    expect(live).toBeDefined();
    expect(live.requiresApproval).toBe(true);
  });

  it("test mode blocks live API key usage", () => {
    const test = tpl.permissions.find((p) => p.resource === "stripe.com/test")!;
    expect(test.blockedActions).toContain("use live API key");
    expect(test.blockedActions).toContain("charge real payment methods");
  });
});

describe("email_draft_send template", () => {
  const tpl = POLICY_TEMPLATES.find((t) => t.id === "email_draft_send")!;

  it("exists", () => expect(tpl).toBeDefined());

  it("has exactly two permissions", () => {
    expect(tpl.permissions).toHaveLength(2);
  });

  it("draft permission does not require approval", () => {
    const draft = tpl.permissions.find((p) => p.action === "create_content")!;
    expect(draft).toBeDefined();
    expect(draft.requiresApproval).toBe(false);
  });

  it("send permission requires approval", () => {
    const send = tpl.permissions.find((p) => p.action === "send_email")!;
    expect(send).toBeDefined();
    expect(send.requiresApproval).toBe(true);
  });

  it("draft permission blocks sending", () => {
    const draft = tpl.permissions.find((p) => p.action === "create_content")!;
    expect(draft.blockedActions).toContain("send email");
  });
});

describe("browser_safe_purchase template", () => {
  const tpl = POLICY_TEMPLATES.find((t) => t.id === "browser_safe_purchase")!;

  it("exists", () => expect(tpl).toBeDefined());

  it("has exactly two permissions", () => {
    expect(tpl.permissions).toHaveLength(2);
  });

  it("browse permission does not require approval", () => {
    const browse = tpl.permissions.find((p) => p.action === "browse_web")!;
    expect(browse).toBeDefined();
    expect(browse.requiresApproval).toBe(false);
  });

  it("purchase permission requires approval", () => {
    const purchase = tpl.permissions.find((p) => p.action === "purchase")!;
    expect(purchase).toBeDefined();
    expect(purchase.requiresApproval).toBe(true);
  });

  it("purchase permission has a default maxAmount constraint", () => {
    const purchase = tpl.permissions.find((p) => p.action === "purchase")!;
    expect(purchase.constraints?.maxAmount).toBeDefined();
    expect(typeof purchase.constraints?.maxAmount).toBe("number");
  });

  it("browse permission blocks payment form submissions", () => {
    const browse = tpl.permissions.find((p) => p.action === "browse_web")!;
    expect(browse.blockedActions).toContain("submit payment forms");
  });
});

describe("getPolicyTemplate", () => {
  it("returns template by id", () => {
    const tpl = getPolicyTemplate("github_read_issues");
    expect(tpl).toBeDefined();
    expect(tpl!.id).toBe("github_read_issues");
  });

  it("returns undefined for unknown id", () => {
    expect(getPolicyTemplate("nonexistent")).toBeUndefined();
  });
});

describe("getPolicyTemplatesByCategory", () => {
  it("groups templates by category", () => {
    const grouped = getPolicyTemplatesByCategory();
    expect(grouped.coding_agent).toBeDefined();
    expect(grouped.coding_agent.length).toBeGreaterThanOrEqual(2);
    expect(grouped.vcs).toBeDefined();
    expect(grouped.filesystem).toBeDefined();
    expect(grouped.database).toBeDefined();
    expect(grouped.payment).toBeDefined();
    expect(grouped.communication).toBeDefined();
    expect(grouped.browser).toBeDefined();
  });
});

describe("POLICY_CATEGORY_LABELS", () => {
  it("has a label for every category used by templates", () => {
    const usedCategories = new Set(POLICY_TEMPLATES.map((t) => t.category));
    for (const cat of usedCategories) {
      expect(POLICY_CATEGORY_LABELS[cat], `label for ${cat}`).toBeTruthy();
    }
  });
});

describe("no misleading integrations", () => {
  it("templates use resources that BehalfID can actually constrain", () => {
    const validResources = new Set([
      "local-filesystem",
      "staging",
      "production",
      "github.com",
      "database",
      "stripe.com/test",
      "stripe.com/live",
      "email",
      "web"
    ]);
    for (const t of POLICY_TEMPLATES) {
      for (const p of t.permissions) {
        expect(validResources.has(p.resource), `${t.id}: unexpected resource '${p.resource}'`).toBe(true);
      }
    }
  });

  it("templates that require approval have requiresApproval: true", () => {
    const twoPermissionTemplates = POLICY_TEMPLATES.filter((t) => t.permissions.length > 1);
    for (const t of twoPermissionTemplates) {
      const gatedPermission = t.permissions.find((p) => p.requiresApproval);
      expect(gatedPermission, `${t.id} should have at least one gated permission`).toBeDefined();
    }
  });
});
