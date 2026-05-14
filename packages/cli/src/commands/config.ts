import { Command } from "commander";
import { CONFIG_FILE_PATH, patchConfig, readConfig, writeConfig } from "../lib/config.js";
import { isJsonMode, printJson, printTable, runAction } from "../lib/output.js";

const VALID_KEYS = ["api-key", "agent-id", "base-url"] as const;
type CKey = (typeof VALID_KEYS)[number];
const KEY_MAP: Record<CKey, "apiKey" | "agentId" | "baseUrl"> = {
  "api-key": "apiKey",
  "agent-id": "agentId",
  "base-url": "baseUrl",
};

function assertKey(key: string): CKey {
  if (!VALID_KEYS.includes(key as CKey)) {
    throw new Error(`Unknown key "${key}". Valid keys: ${VALID_KEYS.join(", ")}`);
  }
  return key as CKey;
}

export function configCommand() {
  const cmd = new Command("config").description("manage local CLI config");

  cmd
    .command("set <key> <value>")
    .description("set a config value (keys: api-key, agent-id, base-url)")
    .action(
      runAction(async (key: string, value: string) => {
        const k = assertKey(key);
        patchConfig({ [KEY_MAP[k]]: value });
        if (!isJsonMode()) console.log(`Set ${key}.`);
        else printJson({ key, value });
      })
    );

  cmd
    .command("get <key>")
    .description("get a config value")
    .action(
      runAction(async (key: string) => {
        const k = assertKey(key);
        const val = readConfig()[KEY_MAP[k]];
        if (isJsonMode()) printJson({ [key]: val ?? null });
        else console.log(val ?? "(not set)");
      })
    );

  cmd
    .command("list")
    .description("list all config values")
    .action(
      runAction(async () => {
        const cfg = readConfig();
        const rows = {
          "api-key": cfg.apiKey ? `${cfg.apiKey.slice(0, 15)}…` : "(not set)",
          "agent-id": cfg.agentId ?? "(not set)",
          "base-url": cfg.baseUrl ?? "(not set)",
          "config file": CONFIG_FILE_PATH,
        };
        if (isJsonMode()) printJson(rows);
        else printTable([rows]);
      })
    );

  cmd
    .command("clear")
    .description("clear all config values")
    .action(
      runAction(async () => {
        writeConfig({});
        if (!isJsonMode()) console.log("Config cleared.");
        else printJson({ cleared: true });
      })
    );

  return cmd;
}
