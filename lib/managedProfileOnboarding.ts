import { CLI_NPM_INSTALL_COMMAND } from "./cliInstallCommands";

export type ManagedProfileOnboardingStep = {
  title: string;
  commands: Array<{ command: string; explanation: string }>;
};

export const MANAGED_PROFILE_ONBOARDING_STEPS: ManagedProfileOnboardingStep[] = [
  {
    title: "Install shims",
    commands: [
      {
        command: CLI_NPM_INSTALL_COMMAND,
        explanation: "Install the global CLI package.",
      },
      {
        command: "behalf login",
        explanation: "Authenticate the CLI with your workspace.",
      },
      {
        command: "behalf profile install",
        explanation: "Install claude, codex, and cursor shims on your PATH.",
      },
    ],
  },
  {
    title: "Verify status",
    commands: [
      {
        command: "behalf profile status --tool claude",
        explanation: "Confirm shim install, PATH order, and policy repo hash.",
      },
    ],
  },
  {
    title: "Simulate policy",
    commands: [
      {
        command: "behalf profile simulate --tool claude",
        explanation: "Dry-run the effective managed profile decision without launching a tool.",
      },
    ],
  },
  {
    title: "Launch a managed tool",
    commands: [
      {
        command: "claude",
        explanation: "Launch through the shim so session policy and activity are recorded.",
      },
    ],
  },
];
