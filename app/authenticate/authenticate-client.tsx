"use client";

import { FormEvent, useState } from "react";
import { Button, Logo } from "@/components/ui";

type Props = { prefillCode?: string; email: string };

export function AuthenticateClient({ prefillCode, email }: Props) {
  const [code, setCode] = useState(prefillCode ?? "");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState("");

  const handleInput = (value: string) => {
    const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (cleaned.length <= 4) setCode(cleaned);
    else setCode(`${cleaned.slice(0, 4)}-${cleaned.slice(4, 8)}`);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setStatus("loading");

    const response = await fetch("/api/auth/device/authorize", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userCode: code }),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Authorization failed. Check the code and try again.");
      setStatus("error");
      return;
    }

    setStatus("done");
  };

  return (
    <main className="auth-page">
      <section className="auth-shell">
        <div className="auth-context">
          <Logo />
          <div>
            <p className="section-kicker">CLI authorization</p>
            <h2>Authorize your terminal.</h2>
            <p>
              Enter the code shown in your terminal to link this browser session to the
              BehalfID CLI. The code expires after 15 minutes.
            </p>
          </div>
          <ul>
            <li>Secure device flow</li>
            <li>No password in terminal</li>
            <li>Revokable at any time</li>
            <li>Session tied to your account</li>
          </ul>
        </div>

        <form className="auth-panel" onSubmit={submit}>
          {status === "done" ? (
            <>
              <p className="section-kicker">Authorized</p>
              <h1>You&rsquo;re in.</h1>
              <p>
                The CLI is now authenticated as <strong>{email}</strong>. You can close
                this tab and return to your terminal.
              </p>
            </>
          ) : (
            <>
              <p className="section-kicker">Enter your code</p>
              <h1>Authorize CLI.</h1>
              <p>
                Signed in as <strong>{email}</strong>. Paste or type the 8-character
                code from your terminal below.
              </p>
              <label>
                <span>Device code</span>
                <input
                  autoComplete="off"
                  autoFocus
                  disabled={status === "loading"}
                  inputMode="text"
                  maxLength={9}
                  onChange={(e) => handleInput(e.target.value)}
                  placeholder="XXXX-XXXX"
                  required
                  spellCheck={false}
                  style={{ fontFamily: "monospace", letterSpacing: "0.08em", fontSize: "1.25rem" }}
                  type="text"
                  value={code}
                />
              </label>
              {error ? <p className="form-error">{error}</p> : null}
              <Button disabled={status === "loading" || code.replace("-", "").length < 8} type="submit" variant="primary">
                {status === "loading" ? "Authorizing…" : "Authorize"}
              </Button>
              <p className="auth-alt">
                Not you?{" "}
                <a href="/logout?next=/authenticate">Switch account</a>
              </p>
            </>
          )}
        </form>
      </section>
    </main>
  );
}
