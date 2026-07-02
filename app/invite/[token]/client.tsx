"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Logo } from "@/components/ui";
import { getRoleLabel, isWorkspaceRole } from "@/lib/authority";

type InvitePreview = {
  status: "pending" | "accepted" | "revoked" | "expired";
  email: string;
  role: string;
  accountId: string;
  accountName: string;
};

type State =
  | "loading"
  | "ready"
  | "accepting"
  | "accepted"
  | "already"
  | "error"
  | "login_required";

export function InviteClient({ token }: { token: string }) {
  const router = useRouter();
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [state, setState] = useState<State>("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/invites/${encodeURIComponent(token)}`, {
          credentials: "include"
        });
        if (cancelled) return;
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          setMessage(body?.error ?? "This invite link is invalid.");
          setState("error");
          return;
        }
        const body = (await res.json()) as { invite: InvitePreview };
        setInvite(body.invite);
        if (body.invite.status === "accepted") {
          setState("already");
        } else if (body.invite.status === "revoked" || body.invite.status === "expired") {
          setMessage(
            body.invite.status === "expired"
              ? "This invite has expired. Ask the workspace owner to send a new invite."
              : "This invite is no longer valid."
          );
          setState("error");
        } else {
          setState("ready");
        }
      } catch {
        if (!cancelled) {
          setMessage("Could not load invite details.");
          setState("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const acceptInvite = async () => {
    setState("accepting");
    setMessage("");
    try {
      const res = await fetch("/api/invites/accept", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
      });
      if (res.status === 401) {
        setState("login_required");
        return;
      }
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        alreadyAccepted?: boolean;
        alreadyMember?: boolean;
      } | null;
      if (!res.ok) {
        setMessage(body?.error ?? "Could not accept invite.");
        setState("error");
        return;
      }
      setState(body?.alreadyAccepted || body?.alreadyMember ? "already" : "accepted");
      setTimeout(() => router.push("/dashboard"), 1200);
    } catch {
      setMessage("Network error. Please try again.");
      setState("error");
    }
  };

  const loginHref = `/login?next=${encodeURIComponent(`/invite/${encodeURIComponent(token)}`)}`;
  const signupHref = `/signup?next=${encodeURIComponent(`/invite/${encodeURIComponent(token)}`)}&email=${encodeURIComponent(invite?.email ?? "")}`;

  return (
    <main id="main-content" className="auth-page invite-page" tabIndex={-1}>
      <section className="auth-shell invite-shell">
        <div className="auth-context">
          <Logo />
          <div>
            <p className="section-kicker">Workspace invite</p>
            <h2>Join a shared BehalfID workspace.</h2> {/* pragma: allowlist secret */}
            <p>Accept an invite to collaborate on agents, permissions, approvals, and audit logs.</p>
          </div>
        </div>
        <div className="auth-panel invite-panel">
          {state === "loading" ? <p>Loading invite…</p> : null}

          {invite && state !== "loading" ? (
            <>
              <p className="section-kicker">Invitation</p>
              <h1>{invite.accountName}</h1>
              <p className="invite-meta">
                Invited as <strong>{isWorkspaceRole(invite.role) ? getRoleLabel(invite.role) : invite.role}</strong>
                {" · "}
                <span>{invite.email}</span>
              </p>

              {state === "ready" || state === "accepting" ? (
                <>
                  <p>Sign in with <strong>{invite.email}</strong> to join this workspace.</p>
                  <div className="invite-actions">
                    <Button variant="primary" type="button" disabled={state === "accepting"} onClick={() => void acceptInvite()}>
                      {state === "accepting" ? "Accepting…" : "Accept invite"}
                    </Button>
                    <Link className="ui-button ui-button--secondary" href={loginHref}>Log in</Link>
                    <Link className="ui-button ui-button--secondary" href={signupHref}>Create account</Link>
                  </div>
                </>
              ) : null}

              {state === "login_required" ? (
                <>
                  <p>Log in or create an account with <strong>{invite.email}</strong> to accept this invite.</p>
                  <div className="invite-actions">
                    <Link className="ui-button ui-button--primary" href={loginHref}>Log in</Link>
                    <Link className="ui-button ui-button--secondary" href={signupHref}>Create account</Link>
                  </div>
                </>
              ) : null}

              {state === "accepted" ? (
                <p className="invite-success">Invite accepted. Redirecting to dashboard…</p>
              ) : null}

              {state === "already" ? (
                <>
                  <p className="invite-success">You already have access to this workspace.</p>
                  <Link className="ui-button ui-button--primary" href="/dashboard">Go to dashboard</Link>
                </>
              ) : null}

              {state === "error" && message ? (
                <p className="form-error" role="alert">{message}</p>
              ) : null}
            </>
          ) : null}

          {!invite && state === "error" ? (
            <>
              <h1>Invite unavailable</h1>
              <p className="form-error" role="alert">{message}</p>
              <Link className="ui-button ui-button--secondary" href="/login">Log in</Link>
            </>
          ) : null}
        </div>
      </section>
    </main>
  );
}
