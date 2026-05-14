import { Command } from "commander";
import { readSession, writeSession } from "../lib/config.js";
import { originOf, resolveBaseUrl } from "../lib/client.js";
import { isJsonMode, printJson, printSuccess, runAction } from "../lib/output.js";
import { ask, askPassword, confirm } from "../lib/prompt.js";

type LoginResponse = { user: { userId: string; email: string } };

export function loginCommand() {
  return new Command("login")
    .description("log in to your BehalfID developer account")
    .option("-e, --email <email>", "developer account email")
    .option("-p, --password <password>", "developer account password")
    .action(
      runAction(async (opts: { email?: string; password?: string }) => {
        if (readSession()) {
          const ok = await confirm("You are already logged in. Log in again?");
          if (!ok) return;
        }

        const baseUrl = resolveBaseUrl();
        const email = opts.email ?? (await ask("Email"));
        const password = opts.password ?? (await askPassword("Password"));
        if (!email || !password) throw new Error("Email and password are required.");

        const response = await fetch(`${baseUrl}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json", Origin: originOf(baseUrl) },
          body: JSON.stringify({ email, password }),
        });

        const setCookie = response.headers.get("set-cookie");
        const match = setCookie?.match(/behalfid_developer=([^;]+)/);
        const sessionCookie = match ? `behalfid_developer=${match[1]}` : null;

        const body = (await response.json().catch(() => null)) as LoginResponse | null;

        if (!response.ok) {
          const msg =
            typeof body === "object" && body !== null && "error" in body && typeof (body as Record<string, unknown>).error === "string"
              ? (body as unknown as { error: string }).error
              : `Login failed with status ${response.status}.`;
          throw new Error(msg);
        }

        if (!sessionCookie) throw new Error("Login succeeded but no session cookie was returned.");
        writeSession(sessionCookie);

        if (isJsonMode()) printJson({ loggedIn: true, email: body?.user.email });
        else printSuccess(`Logged in as ${body?.user.email}.`);
      })
    );
}
