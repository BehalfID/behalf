"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthPrinciple, AuthShell, AuthStateMark, AuthTaskHeader, FormAlert } from "@/components/auth/AuthShell";
import { Button, ButtonLink } from "@/components/ui";
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
  const roleLabel = invite
    ? isWorkspaceRole(invite.role) ? getRoleLabel(invite.role) : invite.role
    : "";

  return (
    <AuthShell
      compact={!invite}
      support={invite ? (
        <AuthPrinciple
          eyebrow="Workspace membership"
          title="Access begins with an explicit invitation."
          description="Membership is tied to the invited account and role. BehalfID verifies both before adding access."
          points={[
            { label: "Workspace", value: invite.accountName },
            { label: "Role", value: roleLabel },
            { label: "Account", value: invite.email }
          ]}
        />
      ) : undefined}
    >
      <section className="auth-task">
        {state === "loading" ? (
          <>
            <AuthStateMark tone="pending" />
            <AuthTaskHeader
              eyebrow="Workspace invitation"
              title="Loading invitation"
              description="We’re checking the invitation before showing workspace details."
            />
            <FormAlert tone="notice">Invitation lookup is in progress.</FormAlert>
          </>
        ) : null}

        {invite && state !== "loading" ? (
          <>
            <AuthTaskHeader
              eyebrow="Workspace invitation"
              title={`Join ${invite.accountName}`}
              description="Review the account and role below, then accept with the invited email address."
            />
            <dl className="invite-summary">
              <div><dt>Workspace</dt><dd>{invite.accountName}</dd></div>
              <div><dt>Role</dt><dd>{roleLabel}</dd></div>
              <div><dt>Invited email</dt><dd>{invite.email}</dd></div>
            </dl>

            {state === "ready" || state === "accepting" ? (
              <>
                <p className="auth-task__meta">You must be signed in with <strong>{invite.email}</strong> and have a verified email to join.</p>
                <div className="invite-actions">
                  <Button
                    loading={state === "accepting"}
                    variant="primary"
                    type="button"
                    onClick={() => void acceptInvite()}
                  >
                    {state === "accepting" ? "Accepting invitation…" : "Accept invitation"}
                  </Button>
                  <ButtonLink href={loginHref} variant="outline">Log in</ButtonLink>
                  <ButtonLink href={signupHref} variant="outline">Create account</ButtonLink>
                </div>
              </>
            ) : null}

            {state === "login_required" ? (
              <>
                <FormAlert tone="notice">Sign in or create an account with <strong>{invite.email}</strong> before accepting.</FormAlert>
                <div className="invite-actions">
                  <ButtonLink href={loginHref} variant="primary">Log in</ButtonLink>
                  <ButtonLink href={signupHref} variant="outline">Create account</ButtonLink>
                </div>
              </>
            ) : null}

            {state === "accepted" ? (
              <>
                <AuthStateMark tone="success" />
                <FormAlert tone="success">Invitation accepted. Redirecting to your dashboard.</FormAlert>
              </>
            ) : null}

            {state === "already" ? (
              <>
                <AuthStateMark tone="success" />
                <FormAlert tone="success">You already have access to this workspace.</FormAlert>
                <ButtonLink href="/dashboard" variant="primary">Go to dashboard</ButtonLink>
              </>
            ) : null}

            {state === "error" && message ? (
              <>
                <FormAlert>{message}</FormAlert>
                {message.startsWith("Email verification required") ? (
                  <ButtonLink href="/verify-email" variant="primary">Verify email</ButtonLink>
                ) : null}
              </>
            ) : null}
          </>
        ) : null}

        {!invite && state === "error" ? (
          <>
            <AuthStateMark tone="error" />
            <AuthTaskHeader
              eyebrow="Workspace invitation"
              title="Invitation unavailable"
              description="This link could not be loaded. It may be invalid, expired, or no longer active."
            />
            <FormAlert>{message}</FormAlert>
            <ButtonLink href="/login" variant="outline">Go to login</ButtonLink>
          </>
        ) : null}
      </section>
    </AuthShell>
  );
}
