import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import { apiRequest, resolveBaseUrl } from "../lib/client.js";
import { requireSession } from "../lib/auth.js";
import { isJsonMode, printJson, runAction } from "../lib/output.js";
import { parsePolicyFileContents, validatePolicyDocumentShape } from "../lib/policyFile.js";

function loadFile(path: string) {
  const absolute = resolve(process.cwd(), path);
  const text = readFileSync(absolute, "utf8");
  return parsePolicyFileContents(text, absolute);
}

export function policyCommand() {
  const cmd = new Command("policy").description("validate and dry-run guardrail policy documents");

  cmd
    .command("validate")
    .description("validate a local policy JSON/YAML file")
    .argument("<file>", "path to policy JSON or YAML")
    .action(
      runAction(async (file: string) => {
        const parsed = loadFile(file);
        const result = validatePolicyDocumentShape(parsed);
        if (!result.ok) {
          throw new Error(result.error);
        }

        if (isJsonMode()) {
          printJson({
            ok: true,
            rules: result.document.rules.length,
            enabled: result.document.enabled,
            version: result.document.version ?? 1
          });
          return;
        }

        console.log(
          `Policy valid: ${result.document.rules.length} rule(s), enabled=${result.document.enabled !== false}`
        );
      })
    );

  cmd
    .command("test")
    .description("dry-run policy rules against sample facts (uses dashboard API)")
    .argument("<file>", "path to policy JSON or YAML")
    .requiredOption("--facts <file>", "JSON file with sample PolicyFacts")
    .action(
      runAction(async (file: string, opts: { facts: string }) => {
        requireSession();
        const parsed = loadFile(file);
        const validated = validatePolicyDocumentShape(parsed);
        if (!validated.ok) throw new Error(validated.error);

        const factsRaw = JSON.parse(readFileSync(resolve(process.cwd(), opts.facts), "utf8"));
        const baseUrl = resolveBaseUrl();
        const data = await apiRequest<{
          evaluation: {
            outcome: string;
            matchedRuleId: string | null;
            reason: string;
          };
        }>("/api/dashboard/policies/test", {
          baseUrl,
          method: "POST",
          body: {
            rules: validated.document.rules,
            facts: factsRaw
          }
        });

        if (isJsonMode()) {
          printJson(data);
          return;
        }

        const evaluation = data.evaluation;
        console.log(`outcome: ${evaluation.outcome}`);
        if (evaluation.matchedRuleId) console.log(`matchedRuleId: ${evaluation.matchedRuleId}`);
        console.log(`reason: ${evaluation.reason}`);
      })
    );

  return cmd;
}
