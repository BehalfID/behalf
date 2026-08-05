"use client";

import { startAuthentication } from "@simplewebauthn/browser";
import { FormEvent, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui";
import { assignOwnedLocation } from "@/lib/subdomainRouting";

/** WebAuthn presence — a browser-only fact, never known while rendering on the server. */
function isWebAuthnAvailable() {
  return typeof window !== "undefined" && typeof window.PublicKeyCredential !== "undefined";
}

/** Capability is fixed for the lifetime of the page, so there is nothing to watch. */
const subscribeToNothing = () => () => {};

/**
 * Assumed available for the server render *and* the hydration pass, so both
 * produce the same markup. A browser that actually lacks WebAuthn corrects this
 * in the render straight after hydration.
 */
const assumeAvailableOnServer = () => true;

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
  // Reading WebAuthn support during render made the server emit `disabled` plus
  // a "not supported" paragraph that the client's first render omits — a
  // structural hydration mismatch on every login page view. React responded by
  // regenerating the tree (minified error #418), and because <html> is a React
  // 19 Host Singleton the regeneration rebuilt its attributes from props and
  // dropped the `data-theme` / `dark` the pre-paint bootstrap had just set.
  // That is what left the auth page painting the light `.ds` register inside a
  // dark document.
  //
  // `useSyncExternalStore` keeps the server render and the hydration render on
  // the same snapshot, so the markup matches; the true capability lands in the
  // render immediately after hydration.
  const webAuthnAvailable = useSyncExternalStore(
    subscribeToNothing,
    isWebAuthnAvailable,
    assumeAvailableOnServer
  );

  if (!enabled) return null;

  // Only a confirmed absence disables the control; the click handler re-checks
  // before starting a ceremony regardless.
  const unsupported = !webAuthnAvailable;

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    if (!isWebAuthnAvailable()) {
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
        disabled={busy || unsupported}
        onClick={(e) => void signIn(e as unknown as FormEvent)}
      >
        {busy ? "Waiting for passkey…" : "Sign in with a passkey"}
      </Button>
      {unsupported ? (
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
