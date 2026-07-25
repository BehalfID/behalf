"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { AuthPrinciple, AuthShell, AuthStateMark, AuthTaskHeader, FormAlert } from "@/components/auth/AuthShell";
import { Button, Field, FieldDescription, FieldLabel, Input } from "@/components/ui";

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
      returnHref="/dashboard"
      returnLabel="Back to control plane"
      support={
        <AuthPrinciple
          eyebrow="CLI device authorization"
          title="Link your terminal without sharing a password."
          description="The short-lived code binds this browser session to the requesting CLI. It expires after 15 minutes."
          points={[
            { label: "Session", value: "Signed in as the current account" },
            { label: "Secret", value: "No password is entered in the terminal" },
            { label: "Control", value: "CLI access can be revoked later" }
          ]}
        />
      }
    >
      {status === "done" ? (
        <section className="auth-task">
          <AuthStateMark tone="success" />
          <AuthTaskHeader
            eyebrow="CLI authorized"
            title="Return to your terminal"
            description={<>The CLI is now authenticated as <strong>{email}</strong>. You can close this tab.</>}
          />
          <FormAlert tone="success">Authorization completed.</FormAlert>
        </section>
      ) : (
        <form className="auth-task" onSubmit={submit} aria-busy={status === "loading"}>
          <AuthTaskHeader
            eyebrow="Enter device code"
            title="Authorize the BehalfID CLI"
            description={<>Signed in as <strong>{email}</strong>. Enter the 8-character code shown in your terminal.</>}
          />
          <Field>
            <FieldLabel htmlFor="device-code">Device code</FieldLabel>
            <Input
              aria-describedby={error ? "device-code-error" : "device-code-help"}
              autoComplete="off"
              autoFocus
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
            <FieldDescription id="device-code-help">The code is not case-sensitive and expires after 15 minutes.</FieldDescription>
          </Field>
          {error ? <FormAlert id="device-code-error">{error}</FormAlert> : null}
          <Button
            disabled={code.replace("-", "").length < 8}
            loading={status === "loading"}
            type="submit"
            variant="primary"
          >
            {status === "loading" ? "Authorizing CLI…" : "Authorize CLI"}
          </Button>
          <p className="auth-task__row auth-task__row--center">
            Not your account? <Link href="/logout?next=/authenticate">Switch account</Link>
          </p>
        </form>
      )}
    </AuthShell>
  );
}
