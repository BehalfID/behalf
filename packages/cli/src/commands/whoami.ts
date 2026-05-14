import { Command } from "commander";
import { readConfig, readSession } from "../lib/config.js";
import { apiRequest, resolveBaseUrl } from "../lib/client.js";
import { isJsonMode, printJson, printKv, runAction } from "../lib/output.js";

type MeResponse = {
  user: { userId: string; email: string; createdAt: string };
};

export function whoamiCommand() {
  return new Command("whoami")
    .description("show current authentication status")
    .action(
      runAction(async function () {
        const config = readConfig();
        const session = readSession();
        const baseUrl = resolveBaseUrl();

        let user: MeResponse["user"] | null = null;

        if (session) {
          try {
            const data = await apiRequest<MeResponse>("/api/auth/me", { baseUrl });
            user = data.user;
          } catch {
            // session may be expired
          }
        }

        if (isJsonMode()) {
          printJson({
            loggedIn: !!user,
            email: user?.email ?? null,
            userId: user?.userId ?? null,
            apiKey: config.apiKey ? `${config.apiKey.slice(0, 15)}…` : null,
            baseUrl: config.baseUrl ?? null,
          });
          return;
        }

        if (user) {
          printKv({
            email: user.email,
            userId: user.userId,
            "api key": config.apiKey ? `${config.apiKey.slice(0, 15)}…` : "(not set)",
            "base url": baseUrl,
          });
        } else {
          console.log("Not logged in.");
          if (config.apiKey) {
            console.log(`API key: ${config.apiKey.slice(0, 15)}…`);
          }
          console.log(`Base URL: ${baseUrl}`);
          console.log('\nRun `behalf login` to authenticate.');
        }
      })
    );
}
