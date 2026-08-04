"use client";

import { useState, type AnchorHTMLAttributes } from "react";
import { githubAuthHref, type GitHubOAuthMode } from "@/lib/githubOAuthClient";

type ButtonSize = "small" | "default" | "large";
type ButtonVariant = "primary" | "secondary" | "outline" | "ghost";

function GitHubMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

export type ContinueWithGitHubProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "href" | "children"
> & {
  mode: GitHubOAuthMode;
  next?: string | null;
  label?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
  /**
   * Presentation-only escape hatch: drop the legacy `ui-button` chrome so the
   * caller supplies the full visual treatment (used by the Lovable auth shell).
   * Does not affect the OAuth href, state cookie or navigation behaviour.
   */
  unstyled?: boolean;
};

/**
 * Starts GitHub sign-in via /api/auth/github, which issues the same session
 * cookie as password auth.
 *
 * A plain anchor rather than a router push: the redirect must be a full
 * navigation so the state cookie set by the route is committed before the
 * browser leaves for GitHub.
 */
export function ContinueWithGitHub({
  mode,
  next,
  label = "Continue with GitHub",
  className,
  size = "default",
  variant = "secondary",
  unstyled = false,
  onClick,
  ...props
}: ContinueWithGitHubProps) {
  // The redirect replaces the page, so this state only ever transitions once.
  // It exists so the button reads as busy if GitHub is slow to respond.
  const [redirecting, setRedirecting] = useState(false);

  const classes = (
    unstyled
      ? [className]
      : [
          "ui-button",
          `ui-button--${variant}`,
          size !== "default" ? `ui-button--${size}` : undefined,
          "auth-github-button",
          className
        ]
  )
    .filter(Boolean)
    .join(" ");

  return (
    <a
      aria-busy={redirecting || undefined}
      aria-disabled={redirecting || undefined}
      className={classes}
      href={githubAuthHref(mode, next)}
      onClick={(event) => {
        setRedirecting(true);
        onClick?.(event);
      }}
      {...props}
    >
      <GitHubMark />
      <span>{redirecting ? "Redirecting to GitHub…" : label}</span>
    </a>
  );
}
