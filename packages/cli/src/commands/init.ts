import { Command } from "commander";
import { patchConfig, readConfig, readSession, writeSession } from "../lib/config.js";
import { DEFAULT_BASE_URL, originOf, resolveBaseUrl } from "../lib/client.js";
import { ask, askPassword, confirm } from "../lib/prompt.js";
import { runAction } from "../lib/output.js";

type LoginResponse = {
  user: { userId: string; email: string };
};

export function initCommand() {
  return new Command("init")
    .description("interactive setup wizard")
    .action(
      runAction(async function () {
        const config = readConfig();
        const hasSession = !!readSession();

        console.log("\nWelcome to BehalfID CLI\n");

        if (config.baseUrl || config.apiKey || hasSession) {
          console.log("Current config:");
          if (config.baseUrl) console.log(`  base url: ${config.baseUrl}`);
          if (config.apiKey) console.log(`  api key:  ${config.apiKey.slice(0, 15)}…`);
          if (hasSession) console.log(`  session:  active`);
          console.log("");
        }

        // Base URL
        const baseUrlInput = await ask("Base URL", config.baseUrl ?? DEFAULT_BASE_URL);
        const baseUrl = baseUrlInput.replace(/\/+$/, "");
        if (baseUrl !== config.baseUrl) patchConfig({ baseUrl });

        // Auth
        console.log("\nHow would you like to authenticate?");
        console.log("  1. Log in with email and password");
        console.log("  2. Enter an agent API key");
        console.log("  3. Skip");
        const choice = await ask("Choice", "1");

        if (choice === "1") {
          const email = await ask("Email");
          const password = await askPassword("Password");

          const response = await fetch(`${baseUrl}/api/auth/login`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              Origin: originOf(baseUrl),
            },
            body: JSON.stringify({ email, password }),
          });

          const setCookie = response.headers.get("set-cookie");
          const match = setCookie?.match(/behalfid_developer=([^;]+)/);
          const sessionCookie = match ? `behalfid_developer=${match[1]}` : null;

          const body = (await response.json().catch(() => null)) as LoginResponse | null;

          if (!response.ok || !sessionCookie) {
            const msg =
              typeof body === "object" &&
              body !== null &&
              "error" in body &&
              typeof (body as Record<string, unknown>).error === "string"
                ? (body as unknown as { error: string }).error
                : "Login failed.";
            throw new Error(msg);
          }

          writeSession(sessionCookie);
          console.log(`\nLogged in as ${body?.user.email}.`);

        } else if (choice === "2") {
          const apiKey = await ask("Agent API key (bhf_sk_...)");
          if (apiKey) {
            patchConfig({ apiKey });
            console.log("API key saved.");
          }
        }

        console.log("\nSetup complete. Run `behalf --help` to see available commands.\n");
      })
    );
}
