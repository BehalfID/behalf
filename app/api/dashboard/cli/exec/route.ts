import { NextResponse, type NextRequest } from "next/server";
import { executeBrowserCliCommand, type BrowserCliConfig } from "@/lib/browserCli/execute";
import { requireVerifiedDeveloperApi } from "@/lib/developerAuth";
import { readJsonObject } from "@/lib/request";
import { jsonError, noCacheJson } from "@/lib/responses";
import { isRecord, readString, rejectUnknownFields } from "@/lib/validation";

function parseConfig(value: unknown): BrowserCliConfig {
  if (!isRecord(value)) return {};
  return {
    agentId: readString(value.agentId) || readString(value["agent-id"]) || undefined,
    apiKey: readString(value.apiKey) || readString(value["api-key"]) || undefined,
    baseUrl: readString(value.baseUrl) || readString(value["base-url"]) || undefined
  };
}

export async function POST(request: NextRequest) {
  const auth = await requireVerifiedDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const unknownError = rejectUnknownFields(body, ["command", "config"]);
  if (unknownError) return jsonError(unknownError);

  const command = typeof body.command === "string" ? body.command : "";
  if (!command.trim()) return jsonError("command is required.");

  const result = await executeBrowserCliCommand({
    command,
    userId: auth.user.userId,
    email: auth.user.email,
    activeAccountId: auth.activeAccountId,
    config: parseConfig(body.config)
  });

  // Expected command failures are returned as HTTP 200 with exitCode !== 0.
  // Only transport / auth / validation issues use non-2xx above.
  if (result.statusHint && result.statusHint >= 500) {
    return jsonError(result.stderr || "CLI execution failed.", 500, { code: "CLI_EXEC_FAILED" });
  }

  return noCacheJson({
    ok: result.ok,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    clear: Boolean(result.clear),
    config: result.config
  });
}

export async function GET() {
  return NextResponse.json(
    {
      supported: [
        "behalf --help",
        "behalf doctor",
        "behalf whoami",
        "behalf agents list",
        "behalf agents show <agentId>",
        "behalf permissions list <agentId>",
        "behalf verify <agentId> --action <action> [--vendor <vendor>] [--amount <n>]",
        "behalf logs [--agent-id <agentId>] [--limit <n>]",
        "behalf config get|set ..."
      ],
      rejects: ["bash", "powershell", "cmd", "node", "python", "curl", "filesystem commands"]
    },
    { status: 200 }
  );
}
