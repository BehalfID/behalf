"use client";

import { startRegistration } from "@simplewebauthn/browser";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { SettingsSection } from "@/components/dashboard/OperationsPrimitives";
import { Button, Field, FieldLabel, Input } from "@/components/ui";
import { oauthErrorMessage } from "@/lib/authProviders/oauthErrors";
import { providerLinkHref } from "@/lib/oauthClientLinks";
import { useDashboardApi } from "@/components/workspace/WorkspaceProvider";

type LinkedProvider = {
  provider: string;
  displayName: string;
  available: boolean;
  linked: boolean;
  username: string | null;
  linkedAt: string | null;
  lastLoginAt: string | null;
  canUnlink: boolean;
  mostRecentlyUsed?: boolean;
};

type PasskeyCredential = {
  credentialRecordId: string;
  nickname: string;
  createdAt: string | null;
  lastUsedAt: string | null;
  canRemove?: boolean;
  mostRecentlyUsed?: boolean;
};

type IdentitiesResponse = {
  hasPassword: boolean;
  password?: {
    present: boolean;
    lastUsedAt: string | null;
    mostRecentlyUsed?: boolean;
  };
  lastSignIn?: {
    at: string | null;
    method: string | null;
    methodDisplayName: string | null;
    userAgent: string | null;
  };
  providers: LinkedProvider[];
  passkeys?: {
    available: boolean;
    canAdd: boolean;
    credentials: PasskeyCredential[];
  };
};

function formatLastUsed(value: string | null | undefined) {
  if (!value) return "Last used unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Last used unknown";
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return `Last used today at ${date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit"
    })}`;
  }
  return `Last used ${date.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric"
  })}`;
}

function formatCreated(value: string | null | undefined) {
  if (!value) return "Created unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Created unknown";
  return `Created ${date.toLocaleDateString(undefined, { month: "long", day: "numeric" })}`;
}

/**
 * Authentication methods for the current account: password, OAuth, passkeys.
 *
 * Linking always starts here rather than from the sign-in page: attaching a
 * provider is an account-security change and requires an existing session.
 */
export function LinkedAccountsSection() {
  const { apiJson, fetch: apiFetch } = useDashboardApi();
  const [data, setData] = useState<IdentitiesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [unlinkTarget, setUnlinkTarget] = useState<string | null>(null);
  const [removePasskeyId, setRemovePasskeyId] = useState<string | null>(null);
  const [renamePasskeyId, setRenamePasskeyId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [password, setPassword] = useState("");
  const [working, setWorking] = useState(false);
  const [passkeyNickname, setPasskeyNickname] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await apiJson<IdentitiesResponse>("/api/auth/identities"));
      setError("");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Authentication methods could not be loaded."
      );
    } finally {
      setLoading(false);
    }
  }, [apiJson]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const linked = params.get("oauth_linked");
    const failure = params.get("oauth_error");
    if (!linked && !failure) return;

    if (linked) setNotice(`${linked === "github" ? "GitHub" : linked} is now connected.`);
    if (failure) setError(oauthErrorMessage(failure));

    params.delete("oauth_linked");
    params.delete("oauth_error");
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}#account-security`
    );
  }, []);

  const submitUnlink = async (event: FormEvent) => {
    event.preventDefault();
    if (!unlinkTarget) return;
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const response = await apiFetch(`/api/auth/identities/${unlinkTarget}`, {
        method: "DELETE",
        body: JSON.stringify(data?.hasPassword ? { password } : {})
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Could not disconnect that provider.");
        return;
      }
      setNotice("Provider disconnected.");
      setUnlinkTarget(null);
      setPassword("");
      await load();
    } catch {
      setError("We could not reach BehalfID. Check your connection and try again.");
    } finally {
      setWorking(false);
    }
  };

  const addPasskey = async () => {
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const optionsResponse = await apiFetch("/api/auth/passkey/register/options", {
        method: "POST",
        body: "{}"
      });
      if (!optionsResponse.ok) {
        const body = (await optionsResponse.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Could not start passkey registration.");
        return;
      }
      const { options } = (await optionsResponse.json()) as {
        options: Parameters<typeof startRegistration>[0]["optionsJSON"];
      };
      const attestation = await startRegistration({ optionsJSON: options });
      const verifyResponse = await apiFetch("/api/auth/passkey/register/verify", {
        method: "POST",
        body: JSON.stringify({
          response: attestation,
          nickname: passkeyNickname.trim() || undefined
        })
      });
      if (!verifyResponse.ok) {
        const body = (await verifyResponse.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Passkey registration failed.");
        return;
      }
      setNotice("Passkey added.");
      setPasskeyNickname("");
      await load();
    } catch (err) {
      if (err instanceof Error && err.name === "NotAllowedError") {
        setError("Passkey registration was cancelled.");
      } else {
        setError("Passkey registration failed. Try again.");
      }
    } finally {
      setWorking(false);
    }
  };

  const submitRename = async (event: FormEvent) => {
    event.preventDefault();
    if (!renamePasskeyId) return;
    setWorking(true);
    setError("");
    try {
      const response = await apiFetch("/api/auth/passkeys", {
        method: "PATCH",
        body: JSON.stringify({ credentialRecordId: renamePasskeyId, nickname: renameValue })
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Could not rename passkey.");
        return;
      }
      setRenamePasskeyId(null);
      setRenameValue("");
      setNotice("Passkey renamed.");
      await load();
    } catch {
      setError("We could not reach BehalfID. Check your connection and try again.");
    } finally {
      setWorking(false);
    }
  };

  const submitRemovePasskey = async (event: FormEvent) => {
    event.preventDefault();
    if (!removePasskeyId) return;
    setWorking(true);
    setError("");
    try {
      const response = await apiFetch("/api/auth/passkeys", {
        method: "DELETE",
        body: JSON.stringify({
          credentialRecordId: removePasskeyId,
          ...(data?.hasPassword ? { password } : {})
        })
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Could not remove passkey.");
        return;
      }
      setRemovePasskeyId(null);
      setPassword("");
      setNotice("Passkey removed.");
      await load();
    } catch {
      setError("We could not reach BehalfID. Check your connection and try again.");
    } finally {
      setWorking(false);
    }
  };

  if (loading) {
    return (
      <SettingsSection
        description="Sign-in methods for your BehalfID account."
        eyebrow="Account-level"
        id="account-security"
        title="Authentication methods"
      >
        <p className="field-help">Loading authentication methods…</p>
      </SettingsSection>
    );
  }

  const providers = data?.providers ?? [];
  const passkeys = data?.passkeys;
  const lastSignIn = data?.lastSignIn;

  return (
    <SettingsSection
      description="Ways you can sign in to this BehalfID account. Connecting a provider never merges accounts."
      eyebrow="Account-level"
      id="account-security"
      title="Authentication methods"
    >
      {notice ? <p className="setup-banner" role="status">{notice}</p> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}

      {lastSignIn?.at ? (
        <div className="settings-summary" style={{ marginBottom: "1.25rem" }}>
          <div>
            <dt>Last signed in with</dt>
            <dd>
              <strong>{lastSignIn.methodDisplayName ?? lastSignIn.method}</strong>
              <br />
              {formatLastUsed(lastSignIn.at).replace(/^Last used /, "")}
              {lastSignIn.userAgent ? (
                <>
                  <br />
                  <span className="field-help">{lastSignIn.userAgent}</span>
                </>
              ) : null}
            </dd>
          </div>
        </div>
      ) : (
        <p className="field-help">Last signed in with — unknown (no recorded successful sign-in yet).</p>
      )}

      <h3 className="settings-subtitle">Sign-in methods</h3>
      <dl className="settings-summary">
        <div>
          <dt>
            Password
            {data?.password?.mostRecentlyUsed ? (
              <span className="field-help"> · Most recently used</span>
            ) : null}
          </dt>
          <dd>
            {data?.hasPassword ? (
              <>
                {formatLastUsed(data.password?.lastUsedAt ?? null)}
                <br />
                <a className="text-link" href="/dashboard/settings#password">
                  Change password
                </a>
              </>
            ) : (
              "Not set — use a connected provider or add a password from account settings."
            )}
          </dd>
        </div>

        {providers.map((provider) => (
          <div key={provider.provider}>
            <dt>
              {provider.displayName}
              {provider.mostRecentlyUsed ? (
                <span className="field-help"> · Most recently used</span>
              ) : null}
            </dt>
            <dd>
              {!provider.available ? (
                "Not available on this deployment."
              ) : provider.linked ? (
                <>
                  {provider.username ? `@${provider.username}` : "Connected"}
                  <br />
                  {formatLastUsed(provider.lastLoginAt)}
                  <br />
                  {provider.canUnlink ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={working}
                      onClick={() => {
                        setUnlinkTarget(provider.provider);
                        setPassword("");
                      }}
                    >
                      Disconnect
                    </Button>
                  ) : (
                    <span className="field-help">
                      Keep another recovery method before disconnecting.
                    </span>
                  )}
                </>
              ) : (
                <a className="text-link" href={providerLinkHref(provider.provider) ?? "#"}>
                  Connect {provider.displayName}
                </a>
              )}
            </dd>
          </div>
        ))}
      </dl>

      {unlinkTarget ? (
        <form className="stack-form" onSubmit={submitUnlink}>
          <p>
            Disconnect {unlinkTarget}? You will need another sign-in method to access this
            account.
          </p>
          {data?.hasPassword ? (
            <Field>
              <FieldLabel htmlFor="unlink-password">Confirm with password</FieldLabel>
              <Input
                id="unlink-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
          ) : null}
          <div className="button-row">
            <Button type="submit" disabled={working}>
              Confirm disconnect
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={working}
              onClick={() => setUnlinkTarget(null)}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      <h3 className="settings-subtitle">Passkeys</h3>
      {!passkeys?.available ? (
        <p className="field-help">Passkeys are not available on this deployment.</p>
      ) : (
        <>
          <p className="field-help">
            {passkeys.credentials.length === 0
              ? "No passkeys yet."
              : `${passkeys.credentials.length} credential${passkeys.credentials.length === 1 ? "" : "s"}`}
          </p>
          <dl className="settings-summary">
            {passkeys.credentials.map((passkey) => (
              <div key={passkey.credentialRecordId}>
                <dt>
                  {passkey.nickname}
                  {passkey.mostRecentlyUsed ? (
                    <span className="field-help"> · Most recently used</span>
                  ) : null}
                </dt>
                <dd>
                  {formatCreated(passkey.createdAt)}
                  <br />
                  {formatLastUsed(passkey.lastUsedAt)}
                  <br />
                  <div className="button-row">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={working}
                      onClick={() => {
                        setRenamePasskeyId(passkey.credentialRecordId);
                        setRenameValue(passkey.nickname);
                      }}
                    >
                      Rename
                    </Button>
                    {passkey.canRemove !== false ? (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={working}
                        onClick={() => {
                          setRemovePasskeyId(passkey.credentialRecordId);
                          setPassword("");
                        }}
                      >
                        Remove
                      </Button>
                    ) : (
                      <span className="field-help">Cannot remove last sign-in method.</span>
                    )}
                  </div>
                </dd>
              </div>
            ))}
          </dl>

          {passkeys.canAdd ? (
            <div className="stack-form">
              <Field>
                <FieldLabel htmlFor="passkey-nickname">Nickname (optional)</FieldLabel>
                <Input
                  id="passkey-nickname"
                  value={passkeyNickname}
                  onChange={(e) => setPasskeyNickname(e.target.value)}
                  placeholder="MacBook Pro"
                  maxLength={80}
                />
              </Field>
              <Button type="button" disabled={working} onClick={() => void addPasskey()}>
                Add passkey
              </Button>
            </div>
          ) : (
            <p className="field-help">
              Add a password or connect GitHub/Google before registering a passkey so you retain
              a recovery method.
            </p>
          )}
        </>
      )}

      {renamePasskeyId ? (
        <form className="stack-form" onSubmit={submitRename}>
          <Field>
            <FieldLabel htmlFor="rename-passkey">Passkey nickname</FieldLabel>
            <Input
              id="rename-passkey"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              maxLength={80}
              required
            />
          </Field>
          <div className="button-row">
            <Button type="submit" disabled={working}>
              Save name
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setRenamePasskeyId(null)}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {removePasskeyId ? (
        <form className="stack-form" onSubmit={submitRemovePasskey}>
          <p>Remove this passkey? Confirm you still have another way to sign in.</p>
          {data?.hasPassword ? (
            <Field>
              <FieldLabel htmlFor="remove-passkey-password">Confirm with password</FieldLabel>
              <Input
                id="remove-passkey-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
          ) : null}
          <div className="button-row">
            <Button type="submit" disabled={working}>
              Confirm remove
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setRemovePasskeyId(null)}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </SettingsSection>
  );
}
