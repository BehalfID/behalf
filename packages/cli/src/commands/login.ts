import { Command } from "commander";
import { readSession, writeSession } from "../lib/config.js";
import { originOf, resolveBaseUrl } from "../lib/client.js";
import { isJsonMode, printJson, printSuccess, runAction } from "../lib/output.js";
import { ask, askPassword, confirm } from "../lib/prompt.js";

type LoginResponse = { user: { userId: string; email: string } };
type DeviceRequestResponse = {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
};
type PollResponse = { status: "pending" | "authorized" | "expired" | "denied"; token?: string };

async function openBrowser(url: string) {
  const { platform } = process;
  const { spawn } = await import("node:child_process");
  const cmd =
    platform === "darwin" ? "open" :
    platform === "win32" ? "cmd" :
    "xdg-open";
  const args = platform === "win32" ? ["/c", "start", url] : [url];
  spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
}

async function deviceFlow(baseUrl: string): Promise<void> {
  const origin = originOf(baseUrl);

  // 1. Request a device code
  const reqRes = await fetch(`${baseUrl}/api/auth/device/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", Origin: origin },
  });
  if (!reqRes.ok) throw new Error(`Failed to start device login (status ${reqRes.status}).`);
  const device = (await reqRes.json()) as DeviceRequestResponse;

  const { deviceCode, userCode, verificationUri, interval } = device;

  // 2. Show instructions
  console.log();
  console.log(`  Open this URL in your browser:`);
  console.log();
  console.log(`    ${verificationUri}`);
  console.log();
  console.log(`  Then enter this code when prompted:`);
  console.log();
  console.log(`    ${userCode}`);
  console.log();

  const urlWithCode = `${verificationUri}?code=${userCode}`;
  try {
    await openBrowser(urlWithCode);
    console.log("  (Browser opened automatically — waiting for authorization…)");
  } catch {
    console.log("  Waiting for authorization…");
  }
  console.log();

  // 3. Poll
  const pollInterval = Math.max(interval ?? 5, 5) * 1000;
  const deadline = Date.now() + device.expiresIn * 1000;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollInterval));

    const pollRes = await fetch(`${baseUrl}/api/auth/device/poll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Origin: origin },
      body: JSON.stringify({ deviceCode }),
    });

    if (!pollRes.ok) continue;

    const poll = (await pollRes.json()) as PollResponse;

    if (poll.status === "authorized") {
      if (!poll.token) throw new Error("Authorized but no session token returned.");
      writeSession(`behalfid_developer=${poll.token}`);

      if (isJsonMode()) printJson({ loggedIn: true });
      else printSuccess("Logged in successfully.");
      return;
    }

    if (poll.status === "denied") throw new Error("Authorization was denied.");
    if (poll.status === "expired") throw new Error("The code expired. Run `behalfid login` again.");
    // status === "pending" — keep polling
  }

  throw new Error("Login timed out. Run `behalfid login` again.");
}

async function passwordFlow(baseUrl: string, email?: string, password?: string): Promise<void> {
  const origin = originOf(baseUrl);
  const resolvedEmail = email ?? (await ask("Email"));
  const resolvedPassword = password ?? (await askPassword("Password"));
  if (!resolvedEmail || !resolvedPassword) throw new Error("Email and password are required.");

  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", Origin: origin },
    body: JSON.stringify({ email: resolvedEmail, password: resolvedPassword }),
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
}

export function loginCommand() {
  return new Command("login")
    .description("log in to your BehalfID developer account")
    .option("--password", "use email/password instead of the browser-based device flow")
    .option("-e, --email <email>", "developer account email (password flow only)")
    .option("-p, --pass <password>", "developer account password (password flow only)")
    .action(
      runAction(async (opts: { password?: boolean; email?: string; pass?: string }) => {
        if (readSession()) {
          const ok = await confirm("You are already logged in. Log in again?");
          if (!ok) return;
        }

        const baseUrl = resolveBaseUrl();

        if (opts.password || opts.email || opts.pass) {
          await passwordFlow(baseUrl, opts.email, opts.pass);
        } else {
          await deviceFlow(baseUrl);
        }
      })
    );
}
