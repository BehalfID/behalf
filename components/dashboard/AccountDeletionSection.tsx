"use client";

import { startAuthentication } from "@simplewebauthn/browser";
import { FormEvent, useCallback, useMemo, useState } from "react";
import {
  DestructiveSettingsSection,
  SettingsSection
} from "@/components/dashboard/OperationsPrimitives";
import { Button } from "@/components/ui";
import { useDashboardApi } from "@/components/workspace/WorkspaceProvider";
import { oauthErrorMessage } from "@/lib/authProviders/oauthErrors";
import { githubAuthHref } from "@/lib/githubOAuthClient";
import { googleAuthHref } from "@/lib/googleOAuthClient";

type ReauthMethod = "password" | "github" | "google" | "passkey";

type UsableMethod = {
  method: ReauthMethod;
  label: string;
  available: boolean;
};

type MethodsResponse = {
  purpose: string;
  methods: UsableMethod[];
  blockedReason: string | null;
  ttlSeconds: number;
};

type ReauthSuccess = {
  reauthToken: string;
  expiresAt: string;
  method: ReauthMethod;
};

const DELETE_CONFIRMATION = "DELETE";
const DEFAULT_TTL_SECONDS = 8 * 60;

type PasskeyRequestOptions = Parameters<typeof startAuthentication>[0]["optionsJSON"];

type OAuthReturnState = {
  open: boolean;
  notice: string;
  proof: ReauthSuccess | null;
  error: string;
};

function readOAuthReturnState(): OAuthReturnState {
  if (typeof window === "undefined") {
    return { open: false, notice: "", proof: null, error: "" };
  }
  const params = new URLSearchParams(window.location.search);
  const reauth = params.get("reauth");
  const failure = params.get("oauth_error");
  if (!reauth && !failure) {
    return { open: false, notice: "", proof: null, error: "" };
  }

  params.delete("reauth");
  params.delete("oauth_error");
  const query = params.toString();
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${query ? `?${query}` : ""}#danger-zone`
  );

  if (reauth === "ok") {
    return {
      open: true,
      notice: "oauth_ok",
      proof: {
        reauthToken: "",
        expiresAt: new Date(Date.now() + DEFAULT_TTL_SECONDS * 1000).toISOString(),
        method: "github"
      },
      error: ""
    };
  }

  return {
    open: Boolean(failure),
    notice: "",
    proof: null,
    error: failure ? oauthErrorMessage(failure) : ""
  };
}

function minutesRemaining(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.max(1, Math.ceil(ms / 60_000));
}

/**
 * Provider-aware account deletion: fresh reauthentication, then an explicit
 * destructive confirmation that consumes a purpose-bound proof.
 */
export function AccountDeletionSection() {
  const { apiJson, fetch: apiFetch } = useDashboardApi();
  const initialReturn = useMemo(() => readOAuthReturnState(), []);
  const [open, setOpen] = useState(initialReturn.open);
  const [loadingMethods, setLoadingMethods] = useState(false);
  const [methods, setMethods] = useState<UsableMethod[]>([]);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);
  const [proof, setProof] = useState<ReauthSuccess | null>(initialReturn.proof);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState(initialReturn.error);
  const [notice, setNotice] = useState(initialReturn.notice);
  const [working, setWorking] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [methodsLoaded, setMethodsLoaded] = useState(false);

  const usable = useMemo(() => methods.filter((m) => m.available), [methods]);
  const hasPassword = usable.some((m) => m.method === "password");
  const hasGithub = usable.some((m) => m.method === "github");
  const hasGoogle = usable.some((m) => m.method === "google");
  const hasPasskey = usable.some((m) => m.method === "passkey");
  const remainingMinutes = minutesRemaining(proof?.expiresAt ?? null);
  const identityConfirmed = Boolean(proof) || notice === "oauth_ok";

  const loadMethods = useCallback(async () => {
    setLoadingMethods(true);
    setError((current) => (notice === "oauth_ok" ? current : ""));
    try {
      const data = await apiJson<MethodsResponse>("/api/auth/reauth/methods");
      setMethods(data.methods ?? []);
      setBlockedReason(data.blockedReason);
      setMethodsLoaded(true);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not load confirmation methods."
      );
    } finally {
      setLoadingMethods(false);
    }
  }, [apiJson, notice]);

  const openDeletion = async () => {
    setOpen(true);
    if (!methodsLoaded) {
      await loadMethods();
    }
  };

  const reset = () => {
    setOpen(false);
    setPassword("");
    setConfirmation("");
    setError("");
    setNotice("");
    setProof(null);
    setWorking(null);
    setDeleting(false);
  };

  const markProof = (body: ReauthSuccess) => {
    setProof(body);
    setNotice("");
    setPassword("");
    setError("");
  };

  const confirmPassword = async (event: FormEvent) => {
    event.preventDefault();
    setWorking("password");
    setError("");
    try {
      const response = await apiFetch("/api/auth/reauth/password", {
        method: "POST",
        body: JSON.stringify({ password })
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Identity confirmation failed. Try again.");
        return;
      }
      const body = (await response.json()) as ReauthSuccess;
      markProof(body);
    } catch {
      setError("Identity confirmation failed. Try again.");
    } finally {
      setWorking(null);
    }
  };

  const confirmPasskey = async () => {
    if (typeof window.PublicKeyCredential === "undefined") {
      setError("Passkeys are not supported in this browser.");
      return;
    }
    setWorking("passkey");
    setError("");
    try {
      const optionsResponse = await apiFetch("/api/auth/reauth/passkey/options", {
        method: "POST",
        body: "{}"
      });
      if (!optionsResponse.ok) {
        const body = (await optionsResponse.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Could not start passkey verification.");
        return;
      }
      const { options } = (await optionsResponse.json()) as {
        options: PasskeyRequestOptions;
      };
      const assertion = await startAuthentication({ optionsJSON: options });
      const verifyResponse = await apiFetch("/api/auth/reauth/passkey/verify", {
        method: "POST",
        body: JSON.stringify({ response: assertion })
      });
      if (!verifyResponse.ok) {
        const body = (await verifyResponse.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Passkey verification failed. Try again.");
        return;
      }
      const body = (await verifyResponse.json()) as ReauthSuccess;
      markProof(body);
    } catch (err) {
      if (err instanceof Error && err.name === "NotAllowedError") {
        setError("Passkey verification was cancelled.");
      } else {
        setError("Passkey verification failed. Try again.");
      }
    } finally {
      setWorking(null);
    }
  };

  const deleteAccount = async (event: FormEvent) => {
    event.preventDefault();
    setDeleting(true);
    setError("");
    try {
      const payload: Record<string, string> = { confirmation };
      if (proof?.reauthToken) payload.reauthToken = proof.reauthToken;
      const response = await apiFetch("/api/auth/account", {
        method: "DELETE",
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(
          body?.error ??
            "Confirm your identity again before deleting this account. Your confirmation may have expired."
        );
        setProof(null);
        setNotice("");
        setDeleting(false);
        return;
      }
      window.location.assign("/login?deleted=1");
    } catch {
      setError("Failed to delete account.");
      setDeleting(false);
    }
  };

  const nextPath =
    typeof window !== "undefined" ? window.location.pathname : "/dashboard/settings";

  const reauthPrompt = (() => {
    if (usable.length === 0) return null;
    if (usable.length === 1 && hasPassword) {
      return "Confirm with your password to continue.";
    }
    if (usable.length === 1 && hasGithub) {
      return "Reauthenticate with GitHub to continue.";
    }
    if (usable.length === 1 && hasGoogle) {
      return "Reauthenticate with Google to continue.";
    }
    if (usable.length === 1 && hasPasskey) {
      return "Verify with your passkey to continue.";
    }
    return "Choose how to confirm your identity:";
  })();

  const showMethodChooser =
    open && !identityConfirmed && (methodsLoaded || loadingMethods || Boolean(error));

  return (
    <SettingsSection
      description="Permanently delete your account and sole-owned workspace data. Shared workspaces keep their data; your membership is removed."
      eyebrow="Destructive actions"
      id="danger-zone"
      title="Account deletion"
      tone="danger"
    >
      <DestructiveSettingsSection
        action={
          !open ? (
            <Button onClick={() => void openDeletion()} type="button" variant="danger">
              Delete account
            </Button>
          ) : (
            <div className="setup-form">
              {loadingMethods ? <p className="field-help">Loading confirmation methods…</p> : null}

              {blockedReason && !identityConfirmed ? (
                <>
                  <p className="field-help" role="status">
                    {blockedReason}
                  </p>
                  <p className="field-help">
                    Account deletion requires a fresh sign-in proof. Email alone cannot authorize
                    deletion. Contact support if you need recovery help.
                  </p>
                  <Button onClick={reset} type="button">
                    Close
                  </Button>
                </>
              ) : null}

              {showMethodChooser && !blockedReason ? (
                <>
                  <p className="field-help">
                    Deletion is permanent. Agents, permissions, API tokens, integrations, and sessions
                    for your account will be removed. Workspaces you solely own are deleted; shared
                    workspaces keep their data and your membership is removed. Transfer ownership
                    first if another person must keep a workspace you alone own.
                  </p>
                  {reauthPrompt ? <p className="field-help">{reauthPrompt}</p> : null}

                  <div className="setup-actions" style={{ flexWrap: "wrap", gap: "0.75rem" }}>
                    {hasPasskey ? (
                      <Button
                        disabled={Boolean(working)}
                        loading={working === "passkey"}
                        onClick={() => void confirmPasskey()}
                        type="button"
                        variant="secondary"
                      >
                        Verify with passkey
                      </Button>
                    ) : null}
                    {hasGithub ? (
                      <a className="ui-button ui-button--secondary" href={githubAuthHref("reauth", nextPath)}>
                        Continue with GitHub
                      </a>
                    ) : null}
                    {hasGoogle ? (
                      <a className="ui-button ui-button--secondary" href={googleAuthHref("reauth", nextPath)}>
                        Continue with Google
                      </a>
                    ) : null}
                  </div>

                  {hasPassword ? (
                    <form className="setup-form" onSubmit={confirmPassword}>
                      {usable.length > 1 ? <p className="field-help">or</p> : null}
                      <label>
                        <span>Password</span>
                        <input
                          autoComplete="current-password"
                          onChange={(event) => setPassword(event.target.value)}
                          required
                          type="password"
                          value={password}
                        />
                      </label>
                      <Button
                        disabled={Boolean(working)}
                        loading={working === "password"}
                        type="submit"
                        variant="secondary"
                      >
                        Confirm
                      </Button>
                    </form>
                  ) : null}

                  <div className="setup-actions">
                    <Button disabled={Boolean(working)} onClick={reset} type="button">
                      Cancel
                    </Button>
                  </div>
                </>
              ) : null}

              {identityConfirmed ? (
                <form className="setup-form" onSubmit={deleteAccount}>
                  <p className="field-help" role="status">
                    Identity confirmed
                    {remainingMinutes != null
                      ? ` · Confirmation expires in ${remainingMinutes} minute${
                          remainingMinutes === 1 ? "" : "s"
                        }`
                      : ""}
                  </p>
                  <p className="field-help">
                    This action cannot be undone. Type <strong>{DELETE_CONFIRMATION}</strong> to
                    permanently delete your account, sessions, developer tokens, passkeys, linked
                    identities, and any workspace you solely own.
                  </p>
                  <label>
                    <span>Confirmation</span>
                    <input
                      autoComplete="off"
                      onChange={(event) => setConfirmation(event.target.value)}
                      placeholder={DELETE_CONFIRMATION}
                      required
                      value={confirmation}
                    />
                  </label>
                  <div className="setup-actions">
                    <Button disabled={deleting} loading={deleting} type="submit" variant="danger">
                      {deleting ? "Deleting…" : "Permanently delete account"}
                    </Button>
                    <Button disabled={deleting} onClick={reset} type="button">
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : null}

              {open && initialReturn.error && !methodsLoaded && !identityConfirmed ? (
                <div className="setup-actions">
                  <Button onClick={() => void openDeletion()} type="button" variant="secondary">
                    Try again
                  </Button>
                  <Button onClick={reset} type="button">
                    Cancel
                  </Button>
                </div>
              ) : null}

              {error ? (
                <p className="form-error" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
          )
        }
        consequence="Deletion removes your user account, sessions, developer tokens, and any workspace you solely own."
        title="Delete account and workspace data"
      />
    </SettingsSection>
  );
}
