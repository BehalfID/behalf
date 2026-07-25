"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button, Field, FieldLabel, Input } from "@/components/ui";
import { useDashboardApi } from "@/components/workspace/WorkspaceProvider";

type MfaStatus = { mfaEnabled: boolean; email: string };

export function MfaSettingsSection() {
  const { apiJson: api } = useDashboardApi();
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const [secret, setSecret] = useState("");
  const [otpauthUrl, setOtpauthUrl] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  const reload = async () => {
    const data = await api<MfaStatus>("/api/dashboard/mfa");
    setStatus(data);
  };

  useEffect(() => {
    void reload().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Failed to load MFA status.");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startEnroll = async () => {
    setError("");
    setMessage("");
    setBackupCodes(null);
    setWorking(true);
    try {
      const data = await api<{ secret: string; otpauthUrl: string }>("/api/dashboard/mfa", {
        method: "POST",
        body: JSON.stringify({ action: "enroll_start" })
      });
      setSecret(data.secret);
      setOtpauthUrl(data.otpauthUrl);
      setMessage("Scan the otpauth URI in your authenticator app, then confirm with a code.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start MFA enrollment.");
    } finally {
      setWorking(false);
    }
  };

  const confirmEnroll = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setWorking(true);
    try {
      const data = await api<{ enabled: boolean; backupCodes: string[] }>("/api/dashboard/mfa", {
        method: "POST",
        body: JSON.stringify({ action: "enroll_confirm", code })
      });
      setBackupCodes(data.backupCodes);
      setSecret("");
      setOtpauthUrl("");
      setCode("");
      setMessage("MFA enabled. Store these backup codes offline — they are shown once.");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm MFA.");
    } finally {
      setWorking(false);
    }
  };

  const disableMfa = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setWorking(true);
    try {
      await api("/api/dashboard/mfa", {
        method: "POST",
        body: JSON.stringify({ action: "disable", code, password })
      });
      setCode("");
      setPassword("");
      setMessage("MFA disabled.");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disable MFA.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <section className="settings-section" aria-labelledby="mfa-settings-heading">
      <h3 id="mfa-settings-heading">Two-factor authentication (TOTP)</h3>
      <p>
        Protect password sign-in with an authenticator app. Google-only accounts can add MFA after
        setting a password.
      </p>
      {status ? (
        <p>
          Status: <strong>{status.mfaEnabled ? "Enabled" : "Disabled"}</strong>
        </p>
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-success">{message}</p> : null}
      {backupCodes ? (
        <ul>
          {backupCodes.map((c) => (
            <li key={c}>
              <code>{c}</code>
            </li>
          ))}
        </ul>
      ) : null}
      {otpauthUrl ? (
        <form onSubmit={confirmEnroll}>
          <p>
            Secret: <code>{secret}</code>
          </p>
          <p className="muted">
            otpauth URI: <code>{otpauthUrl}</code>
          </p>
          <Field>
            <FieldLabel htmlFor="mfa-enroll-code">Authenticator code</FieldLabel>
            <Input
              id="mfa-enroll-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              autoComplete="one-time-code"
            />
          </Field>
          <Button type="submit" loading={working} variant="primary">
            Confirm and enable MFA
          </Button>
        </form>
      ) : null}
      {!status?.mfaEnabled && !otpauthUrl ? (
        <Button type="button" loading={working} onClick={() => void startEnroll()} variant="primary">
          Enable MFA
        </Button>
      ) : null}
      {status?.mfaEnabled ? (
        <form onSubmit={disableMfa}>
          <Field>
            <FieldLabel htmlFor="mfa-disable-password">Password</FieldLabel>
            <Input
              id="mfa-disable-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="mfa-disable-code">Authenticator code</FieldLabel>
            <Input
              id="mfa-disable-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              autoComplete="one-time-code"
            />
          </Field>
          <Button type="submit" loading={working} variant="secondary">
            Disable MFA
          </Button>
        </form>
      ) : null}
    </section>
  );
}
