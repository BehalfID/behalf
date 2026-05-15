import { Command } from "commander";
import { clearSession, readSession } from "../lib/config.js";
import { apiRequest, resolveBaseUrl } from "../lib/client.js";
import { isJsonMode, printJson, printSuccess, runAction } from "../lib/output.js";

export function logoutCommand() {
  return new Command("logout")
    .description("log out of your BehalfID developer account")
    .action(
      runAction(async function () {
        const session = readSession();
        if (!session) {
          if (!isJsonMode()) console.log("Not logged in.");
          else printJson({ loggedOut: false, reason: "not logged in" });
          return;
        }

        const baseUrl = resolveBaseUrl();
        try {
          await apiRequest("/api/auth/logout", {
            method: "POST",
            baseUrl,
          });
        } catch {
          // Server-side logout is best-effort; always clear local session.
        }

        clearSession();

        if (isJsonMode()) printJson({ loggedOut: true });
        else printSuccess("Logged out.");
      })
    );
}
