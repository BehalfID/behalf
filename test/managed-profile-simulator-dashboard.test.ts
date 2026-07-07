import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("managed profile simulator dashboard source", () => {
  const source = readFileSync(
    join(process.cwd(), "components/dashboard/ManagedProfilesView.tsx"),
    "utf-8"
  );

  it("includes simulator panel", () => {
    expect(source).toContain('data-testid="managed-profile-simulator"');
  });

  it("includes tool select", () => {
    expect(source).toContain('data-testid="simulator-tool-select"');
    expect(source).toContain('value="claude"');
    expect(source).toContain('value="codex"');
    expect(source).toContain('value="cursor"');
  });

  it("includes repo hash input", () => {
    expect(source).toContain('data-testid="simulator-repo-hash"');
  });

  it("renders mode and reason in result card", () => {
    expect(source).toContain('data-testid="simulator-result-mode"');
    expect(source).toContain('data-testid="simulator-result-reason"');
    expect(source).toContain("/api/cli/session-policy/simulate");
  });
});

describe("managed profile onboarding dashboard source", () => {
  const source = readFileSync(
    join(process.cwd(), "components/dashboard/ManagedProfilesView.tsx"),
    "utf-8"
  );
  const onboardingSource = readFileSync(
    join(process.cwd(), "lib/managedProfileOnboarding.ts"),
    "utf-8"
  );

  it("includes onboarding card", () => {
    expect(source).toContain('data-testid="managed-profile-onboarding"');
    expect(source).toContain("Connect your first managed CLI");
    expect(source).toContain(
      "Install shims, verify policy, and launch your first managed coding agent."
    );
  });

  it("renders install, status, simulate, and launch commands", () => {
    expect(source).toContain("MANAGED_PROFILE_ONBOARDING_STEPS");
    expect(onboardingSource).toContain("CLI_NPM_INSTALL_COMMAND");
    expect(onboardingSource).toContain("behalf login");
    expect(onboardingSource).toContain("behalf profile install");
    expect(onboardingSource).toContain("behalf profile status --tool claude");
    expect(onboardingSource).toContain("behalf profile simulate --tool claude");
    expect(onboardingSource).toMatch(/\bclaude\b/);
  });

  it("uses compact command rows with copy feedback", () => {
    expect(source).toContain("OnboardingCommandGroup");
    expect(source).toContain("OnboardingCompactCommand");
    expect(source).toContain("onboarding-command-row");
    expect(source).toContain('"Copied"');
    expect(source).toContain('"Copy failed"');
    expect(source).toContain('"Copy"');
    expect(source).toContain("navigator.clipboard?.writeText");
    expect(source).toContain(".catch(");
  });

  it("shows a fallback when activity hint fetch fails", () => {
    expect(source).toContain("activityFetchFailed");
    expect(source).toContain("Activity status unavailable");
  });

  it("includes policy status callout copy", () => {
    expect(source).toContain("Managed Profiles disabled");
    expect(source).toContain("Enable the policy before expecting enforcement.");
    expect(source).toContain('data-testid="managed-profile-onboarding-policy-hint"');
  });

  it("includes no protected repos helper copy", () => {
    expect(source).toContain("No protected repos");
    expect(source).toContain("Run a managed tool, then enroll the repo from Activity.");
    expect(source).toContain("Protected repo enforcement configured");
    expect(source).toContain("At least one enabled repo is protected.");
    expect(source).toContain("repo.enabled && repo.repoHash.trim()");
  });

  it("includes activity link and hint", () => {
    expect(source).toContain('data-testid="managed-profile-onboarding-activity-link"');
    expect(source).toContain("/dashboard/managed-profiles/activity");
    expect(source).toContain("/api/dashboard/managed-profiles/activity?limit=1");
    expect(source).toContain("No activity yet");
    expect(source).toContain("Launch a managed tool after installing shims.");
    expect(source).toContain("Last activity");
  });

  it("links to policy simulator, protected repos, and CLI docs", () => {
    expect(source).toContain("View activity");
    expect(source).toContain("Jump to simulator");
    expect(source).toContain("#managed-profile-simulator");
    expect(source).toContain("#managed-profile-protected-repos");
    expect(source).toContain("/docs/cli");
    expect(source).toContain("managed-profile-onboarding-action");
  });
});

describe("managed profile pause approval formatting", () => {
  it("includes approval id, device id, and clearer reason labels", async () => {
    const { formatPauseApprovalDetails } = await import("@/components/dashboard/opsLogTypes");
    const details = formatPauseApprovalDetails({
      approvalId: "apr_test",
      requestId: "req_test",
      agentId: "behalf_cli_pause",
      permissionId: "perm_test",
      action: "managed_profile_pause",
      status: "pending",
      kind: "managed_profile_pause",
      requesterName: "Alice",
      pauseTool: "claude",
      pauseScope: "all",
      pauseDeviceId: "devmac_test",
      requestedDurationMinutes: 30,
      pauseReason: "incident response",
      contextReason: "Protected repository policy applies (required).",
    });
    expect(details).toContain("Approval: apr_test");
    expect(details).toContain("Device: devmac_test");
    expect(details).toContain("Pause reason: incident response");
    expect(details).toContain("Policy context:");
    expect(details).not.toContain("Required context:");
  });
});

describe("cli install commands", () => {
  it("builds npm install command from package name", async () => {
    const { CLI_NPM_INSTALL_COMMAND } = await import("@/lib/cliInstallCommands");
    expect(CLI_NPM_INSTALL_COMMAND).toMatch(/^npm install -g @.+\/cli$/);
  });

  it("docs cli page uses shared npm install command", async () => {
    const { CLI_NPM_INSTALL_COMMAND } = await import("@/lib/cliInstallCommands");
    const docsSource = readFileSync(join(process.cwd(), "app/docs/cli/page.tsx"), "utf-8");
    const demoSource = readFileSync(join(process.cwd(), "app/docs/demo-script/page.tsx"), "utf-8");
    const readmeSource = readFileSync(join(process.cwd(), "packages/cli/README.md"), "utf-8");
    expect(docsSource).toContain("CLI_NPM_INSTALL_COMMAND");
    expect(demoSource).toContain("CLI_NPM_INSTALL_COMMAND");
    expect(readmeSource).toContain("packages/cli/package.json");
    expect(CLI_NPM_INSTALL_COMMAND).toMatch(/^npm install -g @.+\/cli$/);
    expect(docsSource).not.toContain("npm install -g behalf");
    expect(readmeSource).not.toContain("npm install -g behalf");
  });
});

describe("managed profiles docs consistency", () => {
  const demoSource = readFileSync(join(process.cwd(), "app/docs/demo-script/page.tsx"), "utf-8");
  const cliDocsSource = readFileSync(join(process.cwd(), "app/docs/cli/page.tsx"), "utf-8");
  const readmeSource = readFileSync(join(process.cwd(), "packages/cli/README.md"), "utf-8");
  const onboardingSource = readFileSync(join(process.cwd(), "lib/managedProfileOnboarding.ts"), "utf-8");

  const canonicalCommands = [
    "behalf login",
    "behalf profile install",
    "behalf profile status --tool claude",
    "behalf profile simulate --tool claude",
    "claude",
  ];

  const docsSources = [
    { name: "demo-script", source: demoSource },
    { name: "cli docs", source: cliDocsSource },
    { name: "cli readme", source: readmeSource },
    { name: "onboarding", source: onboardingSource },
  ];

  it("includes canonical managed profile commands in demo and docs", () => {
    for (const command of canonicalCommands) {
      expect(demoSource).toContain(command);
      expect(cliDocsSource).toContain(command);
      expect(readmeSource).toContain(command);
      expect(onboardingSource).toContain(command);
    }
  });

  it("mentions simulate, status, protected repos, and pause approval", () => {
    const narrativeSources = [
      { name: "demo-script", source: demoSource },
      { name: "cli docs", source: cliDocsSource },
      { name: "cli readme", source: readmeSource },
    ];
    for (const { source } of narrativeSources) {
      expect(source).toMatch(/simulate/i);
      expect(source).toMatch(/status/i);
      expect(source).toMatch(/protected repo/i);
      expect(source).toMatch(/pause approval/i);
    }
    expect(onboardingSource).toMatch(/simulate/i);
    expect(onboardingSource).toMatch(/status/i);
  });

  it("readme documents npm install from package name", async () => {
    const { CLI_NPM_INSTALL_COMMAND } = await import("@/lib/cliInstallCommands");
    expect(readmeSource).toContain("packages/cli/package.json");
    expect(readmeSource).toContain("npm install -g @…/cli");
    expect(readmeSource).not.toContain("npm install -g behalf");
    expect(CLI_NPM_INSTALL_COMMAND).toMatch(/^npm install -g @.+\/cli$/);
  });

  it("includes fresh-workspace smoke test guide with launch checklist", () => {
    expect(demoSource).toContain("fresh-workspace smoke test");
    expect(demoSource).toContain("Launch checklist (pass / fail)");
    expect(demoSource).toContain("PATH order correct");
    expect(demoSource).toContain("Activity shows repo hash only");
    expect(demoSource).toContain("Required-mode behavior is understandable");
    expect(demoSource).toContain("Pause approval works");
    expect(demoSource).toContain("Doctor output is actionable");
    expect(demoSource).toContain("No raw paths or git remotes in activity rows");
  });

  it("smoke guide mentions PATH order, activity, protected repos, required mode, and pause approval", () => {
    expect(demoSource).toMatch(/PATH order/i);
    expect(demoSource).toMatch(/activity/i);
    expect(demoSource).toMatch(/protected repo/i);
    expect(demoSource).toMatch(/required mode/i);
    expect(demoSource).toMatch(/pause approval/i);
    expect(cliDocsSource).toMatch(/PATH order/i);
    expect(cliDocsSource).toMatch(/activity/i);
    expect(cliDocsSource).toMatch(/protected repo/i);
    expect(cliDocsSource).toMatch(/required mode/i);
    expect(cliDocsSource).toMatch(/pause approval/i);
  });

  it("cli docs include managed profiles troubleshooting section", () => {
    expect(cliDocsSource).toContain("managed-profiles-troubleshooting");
    expect(cliDocsSource).toMatch(/not first in PATH/i);
    expect(cliDocsSource).toMatch(/binary not found/i);
    expect(cliDocsSource).toMatch(/Unauthenticated CLI/i);
    expect(cliDocsSource).toMatch(/Server unavailable/i);
    expect(cliDocsSource).toMatch(/fail-closed/i);
    expect(cliDocsSource).toMatch(/hash not appearing/i);
    expect(cliDocsSource).toMatch(/Activity not appearing/i);
  });

  it("does not include unsafe raw path or git remote examples in user-facing docs", () => {
    const unsafePatterns = [
      /\/Users\/alice/,
      /github\.com\/org\/private/,
      /git@github\.com:.*private/,
    ];
    for (const { name, source } of docsSources) {
      for (const pattern of unsafePatterns) {
        expect(source, `${name} should not match ${pattern}`).not.toMatch(pattern);
      }
    }
  });
});

describe("managed profile doctor actionable fixes", () => {
  const profileSource = readFileSync(
    join(process.cwd(), "packages/cli/src/commands/profile.ts"),
    "utf-8"
  );

  it("includes fix guidance for known doctor warn/error checks", () => {
    expect(profileSource).toContain("fix: pathCheck.pathHint ?? shellPathExportLine(binDir)");
    expect(profileSource).toContain(
      "Run from inside a git repository before checking repo policy or protected repo enrollment."
    );
    expect(profileSource).toContain(
      "Check network access, base URL, and auth; run `behalf login`, then retry `behalf profile simulate --tool claude`."
    );
    expect(profileSource).toContain(
      "Check API compatibility and auth, then retry `behalf pause` with `--reason` and `--duration`."
    );
  });

  it("prints fix lines for non-ok doctor checks", () => {
    expect(profileSource).toContain('if (c.status !== "ok" && c.fix) console.log(`      fix: ${c.fix}`);');
  });
});

describe("managed profile activity empty state", () => {
  it("does not duplicate unfiltered empty copy in table rows", () => {
    const source = readFileSync(
      join(process.cwd(), "components/dashboard/ManagedProfileActivityView.tsx"),
      "utf-8"
    );
    expect(source).toContain("managed-activity-empty__title");
    expect(source).toContain("No managed profile activity yet");
    expect(source).not.toMatch(
      /No managed profile activity yet\.[\s\S]*ops-events__empty[\s\S]*No managed profile activity yet\./
    );
  });
});
