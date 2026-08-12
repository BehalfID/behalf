import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DESTRUCTIVE_COMMAND_PATTERNS,
  PROTECTION_CONTROLS,
  PROTECTION_CONTROL_LIST,
  SENSITIVE_FILE_PATTERNS,
  defaultProtectionPolicy,
  deriveControlAreas,
  matchesPreset,
  presetControls,
  presetPolicy,
  reconcilePreset,
  validateProtectionPolicy,
  type ProtectionControlId,
  type ProtectionPolicy,
  type ProtectionState
} from "@/lib/protectionPolicy";
import {
  buildPermissionsFromProtectionPolicy,
  protectionPermissionBody,
  summarizeProtectionPolicy
} from "@/lib/protectionPolicyPermissions";

const modelMocks = vi.hoisted(() => ({
  permissionFind: vi.fn(),
  permissionUpdateOne: vi.fn(),
  agentUpdateOne: vi.fn(),
  verificationLogCreate: vi.fn(),
  approvalRequestFindOne: vi.fn(),
  approvalRequestFindOneAndUpdate: vi.fn(),
  approvalRequestUpdateOne: vi.fn()
}));

vi.mock("@/models/Permission", () => ({
  default: { find: modelMocks.permissionFind, updateOne: modelMocks.permissionUpdateOne }
}));
vi.mock("@/models/Agent", () => ({ default: { updateOne: modelMocks.agentUpdateOne } }));
vi.mock("@/models/VerificationLog", () => ({
  default: { create: modelMocks.verificationLogCreate }
}));
vi.mock("@/models/ApprovalRequest", () => ({
  default: {
    findOne: modelMocks.approvalRequestFindOne,
    findOneAndUpdate: modelMocks.approvalRequestFindOneAndUpdate,
    updateOne: modelMocks.approvalRequestUpdateOne
  },
  APPROVAL_GRANT_TTL_MS: 30 * 60 * 1_000
}));
vi.mock("@/lib/approvals/emitLifecycle", () => ({
  emitApprovalRequested: vi.fn().mockResolvedValue(undefined),
  emitApprovalApproved: vi.fn().mockResolvedValue(undefined),
  emitApprovalDenied: vi.fn().mockResolvedValue(undefined),
  emitApprovalUsed: vi.fn().mockResolvedValue(undefined)
}));
vi.mock("@/lib/policyEngine/loadPolicy", () => ({
  loadPolicyDocument: vi.fn().mockResolvedValue(null)
}));

/**
 * Persist the compiled policy the way `createPermissionForAgent` does — through
 * the same body serializer the route uses — so what these tests verify is the
 * document that really reaches the database.
 */
function storedPermissions(policy: ProtectionPolicy) {
  return buildPermissionsFromProtectionPolicy(policy).map((permission, index) => {
    const body = protectionPermissionBody(permission);
    return {
      permissionId: `perm_${index}`,
      accountId: "acct_test",
      agentId: "agent_test",
      action: body.action,
      description: body.description,
      resource: body.resource,
      blockedActions: body.blockedActions,
      requiresApproval: body.requiresApproval,
      status: "active" as const,
      constraints: body.constraints ?? {},
      controlId: permission.controlId
    };
  });
}

type VerifyRequest = {
  action: string;
  vendor?: string;
  amount?: number;
  metadata?: Record<string, unknown>;
  policyContext?: Record<string, unknown>;
};

/**
 * Run a request against the permissions the policy compiles to, through the
 * real `verifyAction` decision path.
 */
async function decide(policy: ProtectionPolicy, request: VerifyRequest) {
  const all = storedPermissions(policy);
  const matching = all.filter(
    (permission) =>
      permission.action === request.action ||
      (permission.blockedActions ?? []).includes(request.action)
  );
  modelMocks.permissionFind.mockReturnValue({
    // findMatchingForVerify sorts newest-first.
    sort: vi.fn().mockResolvedValue([...matching].reverse())
  });

  const { verifyAction } = await import("@/lib/verify");
  return verifyAction({
    agentId: "agent_test",
    accountId: "acct_test",
    action: request.action,
    vendor: request.vendor,
    amount: request.amount,
    metadata: request.metadata,
    policyContext: request.policyContext as never
  });
}

function outcomeOf(decision: { allowed: boolean; approvalRequired?: boolean }): ProtectionState {
  if (decision.allowed) return "allow";
  if (decision.approvalRequired) return "approve";
  return "block";
}

function policyWith(overrides: Partial<Record<ProtectionControlId, ProtectionState>>): ProtectionPolicy {
  const base = defaultProtectionPolicy();
  return { ...base, preset: "custom", controls: { ...base.controls, ...overrides } };
}

beforeEach(() => {
  vi.clearAllMocks();
  modelMocks.agentUpdateOne.mockResolvedValue({ matchedCount: 1 });
  modelMocks.permissionUpdateOne.mockResolvedValue({ matchedCount: 1 });
  modelMocks.verificationLogCreate.mockResolvedValue({});
  modelMocks.approvalRequestFindOne.mockResolvedValue(null);
  modelMocks.approvalRequestFindOneAndUpdate.mockResolvedValue(null);
  modelMocks.approvalRequestUpdateOne.mockResolvedValue({ matchedCount: 1 });
});

// ────────────────────────────────────────────────────────────────────────────
// Compilation shape
// ────────────────────────────────────────────────────────────────────────────

describe("protection policy compilation", () => {
  it("never writes prose into allowedActions or blockedActions", () => {
    // A non-empty allowedActions is an exact-match allowlist evaluated before
    // requiresApproval, so a human-readable phrase there denies the very action
    // the control claims to gate. Nothing we generate may contain one.
    const canonicalActions = new Set(PROTECTION_CONTROL_LIST.map((control) => control.action));

    for (const preset of ["recommended", "strict", "minimal"] as const) {
      for (const permission of buildPermissionsFromProtectionPolicy(presetPolicy(preset))) {
        const body = protectionPermissionBody(permission) as Record<string, unknown>;
        expect(body.allowedActions, `${preset}/${permission.controlId}`).toBeUndefined();
        for (const blocked of permission.blockedActions ?? []) {
          expect(canonicalActions.has(blocked), `${preset}/${blocked}`).toBe(true);
          expect(blocked).not.toMatch(/\s/);
        }
      }
    }
  });

  it("emits one permission per control, and two for a banded spending policy", () => {
    const recommended = buildPermissionsFromProtectionPolicy(presetPolicy("recommended"));
    // Recommended requires approval for purchases and sets an auto-allow band.
    expect(recommended.filter((p) => p.controlId === "spend_money")).toHaveLength(2);
    expect(new Set(recommended.map((p) => p.controlId)).size).toBe(PROTECTION_CONTROLS.length);

    const minimal = buildPermissionsFromProtectionPolicy(presetPolicy("minimal"));
    expect(minimal).toHaveLength(PROTECTION_CONTROLS.length);
  });

  it("attaches the credential-file and destructive-command guards to the right actions", () => {
    const permissions = buildPermissionsFromProtectionPolicy(presetPolicy("recommended"));
    const byAction = (action: string) => permissions.find((p) => p.action === action);

    expect(byAction("write_file")?.constraints?.deniedPaths).toEqual([...SENSITIVE_FILE_PATTERNS]);
    expect(byAction("read_file")?.constraints?.deniedPaths).toEqual([...SENSITIVE_FILE_PATTERNS]);
    expect(byAction("execute_command")?.constraints?.deniedCommands).toEqual([
      ...DESTRUCTIVE_COMMAND_PATTERNS
    ]);
    expect(byAction("deploy")?.constraints?.deniedEnvironments).toEqual([
      "production",
      "prod",
      "live"
    ]);
  });

  it("drops the guards when the customer turns them off", () => {
    const policy = presetPolicy("recommended");
    policy.guards = { sensitive_files: false, destructive_commands: false };
    const permissions = buildPermissionsFromProtectionPolicy(policy);
    expect(permissions.find((p) => p.action === "write_file")?.constraints).toBeUndefined();
    expect(permissions.find((p) => p.action === "execute_command")?.constraints).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Every control, every state, through the real decision path
// ────────────────────────────────────────────────────────────────────────────

describe("every control reaches /api/verify with the outcome the UI promises", () => {
  /**
   * Requests shaped the way the real caller sends them: the CLI hook always
   * supplies a file path or command, and a purchase always supplies an amount.
   */
  const REQUESTS: Record<ProtectionControlId, VerifyRequest> = {
    read_files: {
      action: "read_file",
      vendor: "filesystem",
      policyContext: { cwd: "/repo", toolInput: { filePath: "/repo/src/index.ts" } }
    },
    edit_files: {
      action: "write_file",
      vendor: "filesystem",
      policyContext: { cwd: "/repo", toolInput: { filePath: "/repo/src/index.ts" } }
    },
    run_commands: {
      action: "execute_command",
      vendor: "shell",
      policyContext: { cwd: "/repo", toolInput: { command: "npm test" } }
    },
    browse_web: { action: "browse_web", vendor: "docs.example.com" },
    use_connected_tools: { action: "mcp_tool", vendor: "linear" },
    start_subagents: { action: "spawn_agent", vendor: "agent" },
    deploy_production: { action: "deploy_production" },
    deploy_other_environments: { action: "deploy", metadata: { environment: "staging" } },
    change_production_data: { action: "database_migrate_production" },
    change_credentials: { action: "secrets_write" },
    spend_money: { action: "purchase", amount: 5 },
    change_billing: { action: "billing_vendor_api" },
    send_external_messages: { action: "send_email" }
  };

  for (const controlId of PROTECTION_CONTROLS) {
    for (const state of ["allow", "approve", "block"] as const) {
      it(`${controlId} set to "${state}"`, async () => {
        const policy = policyWith({ [controlId]: state });
        // Turn the amount bands off so the control state alone decides here.
        // Banded spending has its own suite below.
        if (controlId === "spend_money") {
          policy.spending = { ...policy.spending, enabled: false };
        }
        const decision = await decide(policy, REQUESTS[controlId]);
        expect(outcomeOf(decision)).toBe(state);
      });
    }
  }
});

// ────────────────────────────────────────────────────────────────────────────
// Scoped and banded controls
// ────────────────────────────────────────────────────────────────────────────

describe("spending limits", () => {
  const policy = (): ProtectionPolicy => ({
    ...defaultProtectionPolicy(),
    preset: "custom",
    spending: { enabled: true, approveOver: 25, blockOver: 100 }
  });

  it("allows below the automatic amount", async () => {
    const decision = await decide(policy(), { action: "purchase", amount: 10 });
    expect(decision.allowed).toBe(true);
  });

  it("allows exactly at the automatic amount", async () => {
    const decision = await decide(policy(), { action: "purchase", amount: 25 });
    expect(decision.allowed).toBe(true);
  });

  it("asks for approval just above the automatic amount", async () => {
    const decision = await decide(policy(), { action: "purchase", amount: 25.01 });
    expect(decision.allowed).toBe(false);
    expect(decision.approvalRequired).toBe(true);
  });

  it("asks for approval at the refusal amount", async () => {
    const decision = await decide(policy(), { action: "purchase", amount: 100 });
    expect(decision.approvalRequired).toBe(true);
  });

  it("refuses above the refusal amount, with no approval to grant", async () => {
    const decision = await decide(policy(), { action: "purchase", amount: 100.01 });
    expect(decision.allowed).toBe(false);
    expect(decision.approvalRequired).toBe(false);
    expect(decision.reason).toMatch(/maxAmount/i);
  });

  it("refuses a purchase that does not say how much it costs", async () => {
    const decision = await decide(policy(), { action: "purchase" });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/amount is required/i);
  });

  it("caps an automatically-allowed purchase at the refusal amount", async () => {
    const base = policy();
    const allowPolicy: ProtectionPolicy = {
      ...base,
      controls: { ...base.controls, spend_money: "allow" }
    };
    expect((await decide(allowPolicy, { action: "purchase", amount: 99 })).allowed).toBe(true);
    const over = await decide(allowPolicy, { action: "purchase", amount: 101 });
    expect(over.allowed).toBe(false);
    expect(over.approvalRequired).toBe(false);
  });
});

describe("scoped rules only apply to their own scope", () => {
  it("lets a staging deploy through but refuses one that reports production", async () => {
    const policy = policyWith({ deploy_other_environments: "allow" });

    const staging = await decide(policy, {
      action: "deploy",
      metadata: { environment: "staging" }
    });
    expect(staging.allowed).toBe(true);

    const production = await decide(policy, {
      action: "deploy",
      metadata: { environment: "production" }
    });
    expect(production.allowed).toBe(false);
    expect(production.reason).toMatch(/environment/i);
  });

  it("treats a deploy that names no environment as non-production", async () => {
    // Documented limitation: the environment comes from request metadata, and
    // an absent value matches no deny pattern. The UI copy says exactly this.
    const policy = policyWith({ deploy_other_environments: "allow" });
    const unnamed = await decide(policy, { action: "deploy" });
    expect(unnamed.allowed).toBe(true);

    // The production action is still gated by its own control.
    expect((await decide(policy, { action: "deploy_production" })).approvalRequired).toBe(true);
  });

  it("refuses credential files while ordinary files stay editable", async () => {
    const policy = policyWith({ edit_files: "allow" });

    const ordinary = await decide(policy, {
      action: "write_file",
      vendor: "filesystem",
      policyContext: { cwd: "/repo", toolInput: { filePath: "/repo/src/app.ts" } }
    });
    expect(ordinary.allowed).toBe(true);

    const secret = await decide(policy, {
      action: "write_file",
      vendor: "filesystem",
      policyContext: { cwd: "/repo", toolInput: { filePath: "/repo/.env" } }
    });
    expect(secret.allowed).toBe(false);
    expect(secret.reason).toBe("path_not_permitted");
  });

  it("refuses destructive commands while ordinary commands still run", async () => {
    const policy = policyWith({ run_commands: "allow" });

    const ordinary = await decide(policy, {
      action: "execute_command",
      vendor: "shell",
      policyContext: { cwd: "/repo", toolInput: { command: "npm run build" } }
    });
    expect(ordinary.allowed).toBe(true);

    const destructive = await decide(policy, {
      action: "execute_command",
      vendor: "shell",
      policyContext: { cwd: "/repo", toolInput: { command: "npm run build && rm -rf /" } }
    });
    expect(destructive.allowed).toBe(false);
    expect(destructive.reason).toBe("command_blocked");
  });

  it("keeps a blocked control blocked even for requests inside a guard's allowance", async () => {
    const policy = policyWith({ run_commands: "block" });
    const decision = await decide(policy, {
      action: "execute_command",
      vendor: "shell",
      policyContext: { cwd: "/repo", toolInput: { command: "npm test" } }
    });
    expect(decision.allowed).toBe(false);
    expect(decision.approvalRequired).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Presets
// ────────────────────────────────────────────────────────────────────────────

describe("presets", () => {
  it("materialise an explicit state for every control", () => {
    for (const preset of ["recommended", "strict", "minimal"] as const) {
      const controls = presetControls(preset);
      for (const id of PROTECTION_CONTROLS) {
        expect(["allow", "approve", "block"]).toContain(controls[id]);
      }
    }
  });

  it("carry no state the verification engine has to interpret", () => {
    // The compiled permission bodies are the entire contract with verify. If a
    // preset name ever leaked into one, enforcement would depend on a label.
    const serialized = JSON.stringify(
      buildPermissionsFromProtectionPolicy(presetPolicy("strict")).map(protectionPermissionBody)
    );
    expect(serialized).not.toMatch(/recommended|strict|minimal|preset/i);
  });

  it("recommended lets normal development run and gates what reaches users", async () => {
    const policy = presetPolicy("recommended");
    expect(
      (
        await decide(policy, {
          action: "write_file",
          vendor: "filesystem",
          policyContext: { cwd: "/repo", toolInput: { filePath: "/repo/src/a.ts" } }
        })
      ).allowed
    ).toBe(true);
    expect((await decide(policy, { action: "deploy_production" })).approvalRequired).toBe(true);
    expect((await decide(policy, { action: "secrets_write" })).approvalRequired).toBe(true);
  });

  it("strict refuses credential changes outright and holds shell commands", async () => {
    const policy = presetPolicy("strict");
    const secrets = await decide(policy, { action: "secrets_write" });
    expect(secrets.allowed).toBe(false);
    expect(secrets.approvalRequired).toBe(false);

    const command = await decide(policy, {
      action: "execute_command",
      vendor: "shell",
      policyContext: { cwd: "/repo", toolInput: { command: "npm test" } }
    });
    expect(command.approvalRequired).toBe(true);
  });

  it("minimal still refuses the two unrecoverable cases", async () => {
    const policy = presetPolicy("minimal");
    expect(
      (
        await decide(policy, {
          action: "execute_command",
          vendor: "shell",
          policyContext: { cwd: "/repo", toolInput: { command: "rm -rf /" } }
        })
      ).allowed
    ).toBe(false);
    expect(
      (
        await decide(policy, {
          action: "read_file",
          vendor: "filesystem",
          policyContext: { cwd: "/repo", toolInput: { filePath: "/repo/.env" } }
        })
      ).allowed
    ).toBe(false);
    expect((await decide(policy, { action: "deploy_production" })).allowed).toBe(true);
  });

  it("re-labels a policy as custom the moment it stops matching its preset", () => {
    const policy = presetPolicy("recommended");
    expect(matchesPreset(policy, "recommended")).toBe(true);

    const edited = reconcilePreset({
      ...policy,
      controls: { ...policy.controls, deploy_production: "block" }
    });
    expect(edited.preset).toBe("custom");

    const restored = reconcilePreset({
      ...edited,
      controls: { ...edited.controls, deploy_production: "approve" }
    });
    expect(restored.preset).toBe("recommended");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Persistence and summary
// ────────────────────────────────────────────────────────────────────────────

describe("persistence", () => {
  it("round-trips through validation unchanged", () => {
    const policy: ProtectionPolicy = {
      ...presetPolicy("recommended"),
      preset: "custom",
      controls: { ...presetControls("recommended"), run_commands: "approve" },
      guards: { sensitive_files: true, destructive_commands: false },
      spending: { enabled: true, approveOver: 10, blockOver: 250 }
    };
    const first = validateProtectionPolicy(JSON.parse(JSON.stringify(policy)));
    expect(first.error).toBeNull();
    const second = validateProtectionPolicy(JSON.parse(JSON.stringify(first.policy)));
    expect(second.policy).toEqual(first.policy);
    expect(first.policy).toEqual(policy);
  });

  it("fills in a missing control with its recommended state instead of losing coverage", () => {
    const { policy } = validateProtectionPolicy({
      preset: "custom",
      controls: { read_files: "allow" }
    });
    expect(policy?.controls.deploy_production).toBe("approve");
    expect(policy?.controls.change_credentials).toBe("approve");
  });

  it("rejects unknown controls, states, and fields", () => {
    expect(validateProtectionPolicy({ controls: { not_a_control: "allow" } }).error).toMatch(
      /unknown control/
    );
    expect(validateProtectionPolicy({ controls: { read_files: "maybe" } }).error).toMatch(
      /allow, approve, or block/
    );
    expect(validateProtectionPolicy({ preset: "paranoid" }).error).toMatch(/preset/);
    expect(validateProtectionPolicy({ extra: 1 }).error).toMatch(/unknown field/);
    expect(
      validateProtectionPolicy({ spending: { approveOver: 100, blockOver: 5 } }).error
    ).toMatch(/blockOver/);
    expect(validateProtectionPolicy("nope").error).toMatch(/must be an object/);
  });

  it("derives control areas the older dashboard panels still read", () => {
    const areas = deriveControlAreas(presetPolicy("recommended"));
    expect(areas).toContain("production_deploys");
    expect(areas).toContain("secrets");
    expect(areas).toContain("billing_vendor_apis");
  });
});

describe("policy review", () => {
  it("is generated from the policy, not written by hand", () => {
    const summary = summarizeProtectionPolicy(presetPolicy("recommended"));
    const labels = (entries: { label: string }[]) => entries.map((entry) => entry.label);

    expect(labels(summary.allowed)).toContain("Create and edit files");
    expect(labels(summary.approval)).toContain("Deploy to production");
    expect(labels(summary.blocked)).toContain("Reading or writing credential files");

    const strict = summarizeProtectionPolicy(presetPolicy("strict"));
    expect(labels(strict.blocked)).toContain("Change secrets and credentials");
    expect(labels(strict.approval)).toContain("Run terminal commands");
  });

  it("places every control in exactly one bucket", () => {
    for (const preset of ["recommended", "strict", "minimal"] as const) {
      const summary = summarizeProtectionPolicy(presetPolicy(preset));
      const controlIds = [...summary.allowed, ...summary.approval, ...summary.blocked]
        .map((entry) => entry.controlId)
        .filter((id) => (PROTECTION_CONTROLS as readonly string[]).includes(id));
      // Banded spending legitimately appears in more than one bucket.
      const withoutSpending = controlIds.filter((id) => id !== "spend_money");
      expect(new Set(withoutSpending).size).toBe(withoutSpending.length);
      expect(new Set(withoutSpending).size).toBe(PROTECTION_CONTROLS.length - 1);
    }
  });

  it("shows the spending bands it will actually enforce", () => {
    const policy: ProtectionPolicy = {
      ...presetPolicy("recommended"),
      spending: { enabled: true, approveOver: 25, blockOver: 100 }
    };
    const summary = summarizeProtectionPolicy(policy);
    expect(summary.allowed).toContainEqual(
      expect.objectContaining({ controlId: "spend_money", detail: "up to 25" })
    );
    expect(summary.approval).toContainEqual(
      expect.objectContaining({ controlId: "spend_money", detail: "25 to 100" })
    );
    expect(summary.blocked).toContainEqual(
      expect.objectContaining({ controlId: "spend_money", detail: "over 100" })
    );
  });
});

describe("dashboard compatibility", () => {
  it("onboarding-created permissions load into the normal permission editor", async () => {
    const { permissionToDraft, serializePermissionDraft } = await import(
      "@/components/dashboard/agent-detail/permissionDrafts"
    );

    for (const permission of buildPermissionsFromProtectionPolicy(presetPolicy("recommended"))) {
      const body = protectionPermissionBody(permission);
      // Shaped the way the agent-detail API serialises a stored permission.
      const stored = {
        permissionId: "perm_x",
        status: "active" as const,
        action: body.action,
        description: body.description,
        resource: body.resource,
        blockedActions: body.blockedActions,
        requiresApproval: body.requiresApproval,
        notes: body.notes,
        template: body.template,
        constraints: body.constraints
      };

      const draft = permissionToDraft(stored);
      expect(draft.action).toBe(body.action);
      expect(draft.requiresApproval).toBe(body.requiresApproval);
      expect(draft.blockedActions).toEqual(body.blockedActions ?? []);

      // Re-saving from the editor without edits must not change enforcement.
      const resaved = serializePermissionDraft(draft);
      expect(resaved.action).toBe(body.action);
      expect(resaved.requiresApproval).toBe(body.requiresApproval);
      expect(resaved.blockedActions).toEqual(body.blockedActions);
      expect(resaved.constraints.maxAmount).toBe(body.constraints?.maxAmount);
      expect(resaved.constraints.deniedPaths).toEqual(body.constraints?.deniedPaths);
      expect(resaved.constraints.deniedCommands).toEqual(body.constraints?.deniedCommands);
    }
  });

  it("classifies the sensitive controls as needing elevated authority to grant", async () => {
    const { classifyPermissionRisk } = await import("@/lib/permissionRisk");
    const permissions = buildPermissionsFromProtectionPolicy(presetPolicy("recommended"));

    const authorityFor = (action: string) => {
      const body = protectionPermissionBody(permissions.find((p) => p.action === action)!);
      return classifyPermissionRisk({
        action: body.action,
        resource: body.resource,
        blockedActions: body.blockedActions,
        requiresApproval: body.requiresApproval,
        template: body.template,
        constraints: { maxAmount: body.constraints?.maxAmount }
      }).requiredAuthorityLevel;
    };

    // Reading files must not demand more authority than editing production.
    expect(authorityFor("deploy_production")).toBeGreaterThan(authorityFor("read_file"));
    expect(authorityFor("secrets_write")).toBeGreaterThan(authorityFor("read_file"));
  });
});
