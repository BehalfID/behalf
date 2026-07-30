"use client";

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
};

type IdentitiesResponse = {
  hasPassword: boolean;
  providers: LinkedProvider[];
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

/**
 * Connected sign-in providers for the current account.
 *
 * Linking always starts here rather than from the sign-in page: attaching a
 * provider to an account is an account-security change, so it has to happen in
 * a session that already proves who the user is.
 */
export function LinkedAccountsSection() {
  const { apiJson, fetch: apiFetch } = useDashboardApi();
  const [data, setData] = useState<IdentitiesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [unlinkTarget, setUnlinkTarget] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await apiJson<IdentitiesResponse>("/api/auth/identities"));
      setError("");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Connected accounts could not be loaded."
      );
    } finally {
      setLoading(false);
    }
  }, [apiJson]);

  useEffect(() => {
    void load();
  }, [load]);

  // The OAuth callback reports its outcome by redirecting back here, so the
  // result has to be read from the URL rather than from a fetch response.
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

  if (loading) {
    return (
      <SettingsSection
        description="Sign-in providers connected to your BehalfID account."
        eyebrow="Account-level"
        id="account-security"
        title="Connected accounts"
      >
        <p className="field-help">Loading connected accounts…</p>
      </SettingsSection>
    );
  }

  const providers = data?.providers ?? [];

  return (
    <SettingsSection
      description="Sign-in providers connected to your BehalfID account. Connecting a provider never merges accounts — it only adds a way to sign in to this one."
      eyebrow="Account-level"
      id="account-security"
      title="Connected accounts"
    >
      {notice ? <p className="setup-banner" role="status">{notice}</p> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}

      {providers.length === 0 ? (
        <p className="ops-empty">No external sign-in providers are enabled for this deployment.</p>
      ) : null}

      <dl className="settings-summary">
        {providers.map((provider) => (
          <div key={provider.provider}>
            <dt>{provider.displayName}</dt>
            <dd>
              {!provider.available ? (
                <span>Not available on this deployment</span>
              ) : provider.linked ? (
                <>
                  <span>
                    Connected{provider.username ? ` as ${provider.username}` : ""} ·{" "}
                    {formatDate(provider.linkedAt)}
                  </span>{" "}
                  {provider.canUnlink ? (
                    <button
                      className="button-link"
                      onClick={() => {
                        setUnlinkTarget(provider.provider);
                        setNotice("");
                        setError("");
                      }}
                      type="button"
                    >
                      Disconnect
                    </button>
                  ) : (
                    <span className="field-help">
                      Set a password before disconnecting, so you keep a way to sign in.
                    </span>
                  )}
                </>
              ) : providerLinkHref(provider.provider) ? (
                <a className="button-link" href={providerLinkHref(provider.provider)!}>
                  Connect {provider.displayName}
                </a>
              ) : (
                <span className="field-help">Linking is not available for this provider yet.</span>
              )}
            </dd>
          </div>
        ))}
      </dl>

      {unlinkTarget ? (
        <form className="operations-form-grid" onSubmit={submitUnlink}>
          <p className="field-help">
            Disconnecting removes this provider as a sign-in method. You can reconnect it later.
          </p>
          {data?.hasPassword ? (
            <Field>
              <FieldLabel htmlFor="unlink-password">Confirm your password</FieldLabel>
              <Input
                autoComplete="current-password"
                id="unlink-password"
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </Field>
          ) : null}
          <div className="setup-actions">
            <Button loading={working} type="submit" variant="danger">
              Disconnect
            </Button>
            <Button
              onClick={() => {
                setUnlinkTarget(null);
                setPassword("");
              }}
              type="button"
              variant="secondary"
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </SettingsSection>
  );
}
