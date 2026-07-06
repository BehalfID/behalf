import { CLI_NPM_INSTALL_COMMAND } from "./cliInstallCommands";

export type ManagedProfileOnboardingStep = {
  title: string;
  summary: string;
  commands: string[];
};

export const MANAGED_PROFILE_ONBOARDING_STEPS: ManagedProfileOnboardingStep[] = [
  {
    title: "Install shims",
    summary: "Install the CLI, authenticate, then install local shims.",
    commands: [CLI_NPM_INSTALL_COMMAND, "behalf login", "behalf profile install"],
  },
  {
    title: "Verify status",
    summary: "Confirm shim install, PATH order, and policy repo hash.",
    commands: ["behalf profile status --tool claude"],
  },
  {
    title: "Simulate policy",
    summary: "Dry-run the effective managed profile decision without launching a tool.",
    commands: ["behalf profile simulate --tool claude"],
  },
  {
    title: "Launch a managed tool",
    summary: "Launch through the shim so session policy and activity are recorded.",
    commands: ["claude"],
  },
];
