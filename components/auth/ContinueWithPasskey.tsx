"use client";

import { startAuthentication } from "@simplewebauthn/browser";
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui";
import { assignOwnedLocation } from "@/lib/subdomainRouting";

/**
 * Discoverable (usernameless) passkey sign-in.
 * Hidden when WebAuthn is unavailable in the browser or the API returns 503.
 */
export function ContinueWithPasskey({
  nextPath,
  enabled = true,
  buttonClassName,
  stackClassName
}: {
  nextPath?: string;
  enabled?: boolean;
  /**
   * Presentation-only overrides used by the Lovable auth shell. They replace the
   * legacy button/stack chrome; the WebAuthn ceremony, endpoints and redirect
   * behaviour are untouched.
   */
  buttonClassName?: string;
  stackClassName?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!enabled || typeof window === "undefined") {
    // Still render a disabled-capable control on the server; client hydrates.
  }

  const browserSupported =
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined";

  if (!enabled) return null;

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    if (!browserSupported) {
      setError("Passkeys are not supported in this browser.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const optionsResponse = await fetch("/api/auth/passkey/authenticate/options", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      });
      if (optionsResponse.status === 503) {
        setError("Passkeys are not available on this deployment.");
        return;
      }
      if (!optionsResponse.ok) {
        setError("Could not start passkey sign-in. Try again.");
        return;
      }
      const { options } = (await optionsResponse.json()) as {
        options: PublicKeyCredentialRequestOptionsJSON;
      };

      const assertion = await startAuthentication({ optionsJSON: options });

      const verifyResponse = await fetch("/api/auth/passkey/authenticate/verify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: assertion })
      });

      if (!verifyResponse.ok) {
        const body = (await verifyResponse.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Passkey sign-in failed. Try again or use another method.");
        return;
      }

      const body = (await verifyResponse.json()) as {
        mfaRequired?: boolean;
        mfaToken?: string;
      };
      if (body.mfaRequired && body.mfaToken) {
        // Hand off to the shared MFA form via a soft reload with token in memory
        // is awkward; mirror password MFA by navigating with a query the client reads.
        sessionStorage.setItem("behalfid_mfa_token", body.mfaToken);
        assignOwnedLocation(
          `/login?oauth_mfa=1${nextPath ? `&next=${encodeURIComponent(nextPath)}` : ""}`
        );
        return;
      }

      assignOwnedLocation(nextPath && nextPath.startsWith("/") ? nextPath : "/dashboard");
    } catch (err) {
      if (err instanceof Error && err.name === "NotAllowedError") {
        setError("Passkey sign-in was cancelled.");
      } else {
        setError("Passkey sign-in failed. Try again or use another method.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={stackClassName ?? "oauth-provider-stack"}>
      <Button
        type="button"
        variant="secondary"
        className={buttonClassName ?? "oauth-provider-button"}
        disabled={busy || !browserSupported}
        onClick={(e) => void signIn(e as unknown as FormEvent)}
      >
        {busy ? "Waiting for passkey…" : "Sign in with a passkey"}
      </Button>
      {!browserSupported ? (
        <p className="field-help">Passkeys are not supported in this browser.</p>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type PublicKeyCredentialRequestOptionsJSON = Parameters<
  typeof startAuthentication
>[0]["optionsJSON"];
