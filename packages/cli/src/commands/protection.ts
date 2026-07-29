import { Command } from "commander";
import { homedir } from "node:os";
import {
  isJsonMode,
  printJson,
  printKv,
  printSuccess,
  printTable,
  runAction,
} from "../lib/output.js";
import {
  addTimedDecision,
  disableAlways,
  enableAlways,
  listDecisions,
  parseDurationToIso,
  readActivationStore,
  resetDecisions,
  resolveActivation,
  resolveRepositoryRoot,
  upsertRepositoryDecision,
  type ActivationResolution,
} from "../lib/protection/index.js";
import { displayHomePath } from "../lib/activation.js";

function printResolution(resolution: ActivationResolution, extra: Record<string, string | null | undefined> = {}) {
  if (isJsonMode()) {
    printJson({ ...resolution, ...extra });
    return;
  }
  printKv({
    active: resolution.enabled ? "yes" : "no",
    mode: resolution.mode,
    reason: resolution.reason,
    source: String(resolution.source),
    "repository root": resolution.repositoryRoot
      ? displayHomePath(resolution.repositoryRoot)
      : "(none)",
    expires: resolution.expiresAt ?? "(none)",
    "session id": resolution.sessionId ?? "(none)",
    ...Object.fromEntries(
      Object.entries(extra).map(([k, v]) => [k, v ?? "(none)"])
    ),
  });
}

function statusCommand() {
  return new Command("status")
    .description("show current BehalfID protection activation status")
    .option("--cwd <path>", "working directory to evaluate", process.cwd())
    .action(
      runAction(async (opts: { cwd?: string }) => {
        const cwd = opts.cwd ?? process.cwd();
        const repoRoot = resolveRepositoryRoot(cwd);
        const resolution = resolveActivation({ cwd, interactive: false });

        const agent =
          process.env.BEHALFID_ACTIVATION_MODE ||
          process.env.BEHALF_MODE ||
          null;

        const managedHint =
          resolution.mode === "managed-profile" || resolution.source === "organization"
            ? "enforced"
            : process.env.BEHALF_MODE === "required" || process.env.BEHALF_MODE === "managed"
              ? String(process.env.BEHALF_MODE)
              : "none";

        if (isJsonMode()) {
          printJson({
            ...resolution,
            repositoryRoot: repoRoot ?? resolution.repositoryRoot ?? null,
            managedEnforcement: managedHint,
            detectableAgentContext: agent,
            storePath: `${homedir().replace(/\\/g, "/")}/.behalf/protection.json`,
          });
          return;
        }

        console.log();
        printResolution(resolution, {
          "detected repo": repoRoot ? displayHomePath(repoRoot) : null,
          "org / managed enforcement": managedHint,
          "agent context": agent,
        });
        console.log();
      })
    );
}

function enableCommand() {
  return new Command("enable")
    .description("enable BehalfID protection for a chosen scope")
    .option("--session", "enable for this process tree / session only")
    .option("--for <duration>", "enable for a limited time (e.g. 4h)")
    .option("--repository [path]", "enable for the detected or given repository root")
    .option("--always", "always enable on this machine")
    .action(
      runAction(
        async (opts: {
          session?: boolean;
          for?: string;
          repository?: string | true;
          always?: boolean;
        }) => {
          const cwd = process.cwd();
          const selected = [
            opts.session ? "session" : null,
            opts.for ? "timed" : null,
            opts.repository !== undefined ? "repository" : null,
            opts.always ? "always" : null,
          ].filter(Boolean);

          if (selected.length !== 1) {
            throw new Error(
              "Specify exactly one of --session, --for <duration>, --repository [path], or --always."
            );
          }

          if (opts.session) {
            const resolution = resolveActivation({
              cwd,
              flag: "enable",
              interactive: false,
            });
            if (isJsonMode()) {
              printJson(resolution);
              return;
            }
            printSuccess(
              `BehalfID protection enabled for this session (${resolution.sessionId ?? "session"}).`
            );
            printSuccess("Session activation is env-only and is not written to protection.json.");
            return;
          }

          if (opts.for) {
            const expiresAt = parseDurationToIso(opts.for);
            const decision = addTimedDecision(expiresAt, "user");
            if (isJsonMode()) {
              printJson(decision);
              return;
            }
            printSuccess(`BehalfID protection enabled until ${expiresAt}.`);
            return;
          }

          if (opts.always) {
            enableAlways("user");
            if (isJsonMode()) {
              printJson({ alwaysEnabled: true });
              return;
            }
            printSuccess("BehalfID protection is always enabled on this machine.");
            return;
          }

          // repository
          const explicit =
            typeof opts.repository === "string" && opts.repository.length > 0
              ? opts.repository
              : undefined;
          const root =
            resolveRepositoryRoot(cwd, explicit) ??
            (explicit ? explicit : cwd);
          const decision = upsertRepositoryDecision(root, true, "user");
          if (isJsonMode()) {
            printJson(decision);
            return;
          }
          printSuccess(
            `BehalfID protection enabled for repository ${displayHomePath(decision.root)}.`
          );
          printSuccess("This applies to the repository root and all subdirectories.");
        }
      )
    );
}

function disableCommand() {
  return new Command("disable")
    .description("disable BehalfID protection for a repository (local decision)")
    .option("--repository [path]", "disable for the detected or given repository root")
    .option("--always", "clear the user-wide always-on setting")
    .action(
      runAction(async (opts: { repository?: string | true; always?: boolean }) => {
        if (!opts.repository && !opts.always) {
          throw new Error("Specify --repository [path] and/or --always.");
        }

        const result: Record<string, unknown> = {};

        if (opts.always) {
          disableAlways();
          result.alwaysCleared = true;
          if (!isJsonMode()) {
            printSuccess("Cleared always-on protection.");
          }
        }

        if (opts.repository !== undefined) {
          const cwd = process.cwd();
          const explicit =
            typeof opts.repository === "string" && opts.repository.length > 0
              ? opts.repository
              : undefined;
          const root =
            resolveRepositoryRoot(cwd, explicit) ??
            (explicit ? explicit : cwd);
          const decision = upsertRepositoryDecision(root, false, "user");
          result.repository = decision;
          if (!isJsonMode()) {
            printSuccess(
              `BehalfID protection disabled for repository ${displayHomePath(decision.root)}.`
            );
          }
        }

        if (isJsonMode()) printJson(result);
      })
    );
}

function resetCommand() {
  return new Command("reset")
    .description("reset local activation decisions (never touches managed-profile remote config)")
    .option("--always", "clear always-on")
    .option("--timed", "clear timed decisions")
    .option("--repositories", "clear all repository decisions")
    .option("--all", "clear always, timed, and repository decisions")
    .action(
      runAction(
        async (opts: {
          always?: boolean;
          timed?: boolean;
          repositories?: boolean;
          all?: boolean;
        }) => {
          if (!opts.all && !opts.always && !opts.timed && !opts.repositories) {
            throw new Error("Specify --always, --timed, --repositories, and/or --all.");
          }

          const scope = opts.all
            ? { always: true, timed: true, repositories: true as boolean }
            : {
                always: Boolean(opts.always),
                timed: Boolean(opts.timed),
                repositories: Boolean(opts.repositories),
              };

          resetDecisions(scope);

          if (isJsonMode()) {
            printJson({ reset: scope });
            return;
          }
          printSuccess("Local activation decisions reset.");
          printSuccess("Managed profile / organization remote config was not modified.");
        }
      )
    );
}

function listCommand() {
  return new Command("list")
    .description("list stored local activation decisions (no secrets)")
    .action(
      runAction(async () => {
        const { warning } = readActivationStore();
        const decisions = listDecisions();

        if (isJsonMode()) {
          printJson({ decisions, warning: warning ?? null });
          return;
        }

        if (warning) {
          console.log(`Warning: ${warning}`);
        }

        if (decisions.length === 0) {
          console.log("(none)");
          return;
        }

        printTable(
          decisions.map((d) => ({
            kind: d.kind,
            enabled: d.enabled ? "yes" : "no",
            root: d.root ? displayHomePath(d.root) : "",
            expires: d.expiresAt ?? "",
            source: d.source ?? "",
            id: d.id ?? "",
          })),
          ["kind", "enabled", "root", "expires", "source", "id"]
        );
      })
    );
}

export function protectionCommand() {
  const cmd = new Command("protection")
    .description("inspect and manage scoped BehalfID protection activation");

  cmd.addCommand(statusCommand());
  cmd.addCommand(enableCommand());
  cmd.addCommand(disableCommand());
  cmd.addCommand(resetCommand());
  cmd.addCommand(listCommand());

  return cmd;
}
