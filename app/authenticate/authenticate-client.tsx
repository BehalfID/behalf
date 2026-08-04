"use client";

import { FormEvent, useState } from "react";
import { FormAlert } from "@/components/auth/AuthShell";
import {
  AuthField,
  AuthFooterLinks,
  AuthProductPanel,
  AuthShell,
  authInputClass,
  authPrimaryButtonClass
} from "@/components/auth/lovable/AuthShell";

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
      body: JSON.stringify({ userCode: code })
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
    <AuthShell
      title={status === "done" ? "Return to your terminal" : "Authorize the BehalfID CLI"}
      description={
        status === "done" ? (
          <>The CLI is now authenticated as <strong>{email}</strong>. You can close this tab.</>
        ) : (
          <>Signed in as <strong>{email}</strong>. Enter the 8-character code shown in your terminal.</>
        )
      }
      panel={
        <AuthProductPanel
          title="Link your terminal without sharing a password."
          description="The short-lived code binds this browser session to the requesting CLI. It expires after 15 minutes."
          points={[
            "Signed in as the current account",
            "No password is entered in the terminal",
            "CLI access can be revoked later"
          ]}
        />
      }
      footer={
        status === "done" ? undefined : (
          <AuthFooterLinks className="text-center">
            Not your account?{" "}
            {/* Document navigation is intentional: GET /logout clears the session before redirecting.
                Do not use next/link — production prefetch would log the user out on page load. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a className="text-primary hover:underline" href="/logout?next=/authenticate">
              Switch account
            </a>
          </AuthFooterLinks>
        )
      }
    >
      {status === "done" ? (
        <FormAlert tone="success">Authorization completed.</FormAlert>
      ) : (
        <form onSubmit={submit} aria-busy={status === "loading"}>
          <AuthField
            htmlFor="device-code"
            label="Device code"
            hint="The code is not case-sensitive and expires after 15 minutes."
          >
            <input
              aria-describedby={error ? "device-code-error" : "device-code-help"}
              autoComplete="off"
              autoFocus
              className={authInputClass}
              disabled={status === "loading"}
              id="device-code"
              inputMode="text"
              maxLength={9}
              onChange={(event) => handleInput(event.target.value)}
              placeholder="XXXX-XXXX"
              required
              spellCheck={false}
              type="text"
              value={code}
            />
          </AuthField>
          {error ? (
            <div className="mt-4">
              <FormAlert id="device-code-error">{error}</FormAlert>
            </div>
          ) : null}
          <button
            className={`${authPrimaryButtonClass} mt-5`}
            disabled={code.replace("-", "").length < 8 || status === "loading"}
            type="submit"
          >
            {status === "loading" ? "Authorizing CLI…" : "Authorize CLI"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
