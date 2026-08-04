"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/design-system/brand";
import { DsAppearanceToggle } from "@/components/design-system/DsAppearanceToggle";
import { ShieldCheck } from "@/components/design-system/icons";
import { cn } from "@/lib/cn";
import { crossAppClickHandler } from "@/lib/subdomainRouting";

/**
 * Lovable authentication presentation.
 *
 * Structure and classes are ported literally from the Lovable source
 * (`src/components/layouts/auth-layout.tsx`): a split screen with the product
 * explanation on a grid-field surface at left and the form panel at right.
 *
 * These components are presentation only — every production auth handler,
 * endpoint, redirect and session behaviour stays in the route components.
 */

/** Compact brand mark used in both the aside and the mobile header. */
export function AuthBrand({ className }: { className?: string }) {
  return <Wordmark className={className} href="/" />;
}

const DEFAULT_POINTS = [
  "Agent identities separate from human accounts",
  "Approval gates on the actions that need judgment",
  "Fail-closed runtime verification",
  "Complete audit evidence for every decision",
];

/** Left column: product explanation over the grid field. Hidden below lg. */
export function AuthProductPanel({
  title = "Control what your AI agents can do.",
  description = "Every sensitive action is verified against least-privilege permissions, approval requirements and organizational policy before it executes.",
  points = DEFAULT_POINTS,
}: {
  title?: string;
  description?: string;
  points?: string[];
}) {
  return (
    <aside className="relative hidden flex-col justify-between border-r bg-surface-2 p-10 lg:flex">
      <div className="absolute inset-0 grid-field opacity-40" aria-hidden />
      <div className="relative">
        <AuthBrand />
      </div>
      <div className="relative max-w-md space-y-6">
        <h2 className="text-2xl font-semibold">{title}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        <ul className="space-y-2.5 text-sm">
          {points.map((item) => (
            <li key={item} className="flex items-start gap-2.5">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span className="text-muted-foreground">{item}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="relative text-xs text-muted-foreground">
        <Link href="/status" className="hover:text-foreground" onClick={crossAppClickHandler("/status")}>
          View live status
        </Link>
      </div>
    </aside>
  );
}

/** Right column: heading, description, form body and footer. */
export function AuthFormPanel({
  title,
  description,
  children,
  footer,
  wide,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <main id="main-content" className="flex flex-col" tabIndex={-1}>
      <div className="flex items-center justify-between p-4 lg:justify-end">
        <span className="lg:hidden">
          <AuthBrand />
        </span>
        <DsAppearanceToggle />
      </div>
      <div className="flex flex-1 items-center justify-center px-4 pb-12">
        <div className={wide ? "w-full max-w-lg" : "w-full max-w-sm"}>
          <h1 className="text-xl font-semibold">{title}</h1>
          {description ? <p className="mt-1.5 text-sm text-muted-foreground">{description}</p> : null}
          <div className="mt-6">{children}</div>
          {footer ? <div className="mt-6 text-sm text-muted-foreground">{footer}</div> : null}
        </div>
      </div>
    </main>
  );
}

/** Full split-screen auth surface. `.ds` scopes the ported Tailwind utilities. */
export function AuthShell({
  title,
  description,
  children,
  footer,
  wide,
  panel,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  panel?: ReactNode;
}) {
  return (
    /* `.ds` must be an ANCESTOR: the scoped stylesheet emits `.ds <utility>`
       (descendant), so utilities on the `.ds` element itself would not match. */
    <div className="ds">
      <div className="grid min-h-dvh overflow-x-clip lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
        {panel ?? <AuthProductPanel />}
        <AuthFormPanel title={title} description={description} footer={footer} wide={wide}>
          {children}
        </AuthFormPanel>
      </div>
    </div>
  );
}

/** Rule with a centred label, used between OAuth/passkey and credentials. */
export function AuthDivider({ label = "or", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("my-5 flex items-center gap-3", className)} role="separator">
      <span className="h-px flex-1 bg-border" />
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/** Label + control pair. Matches the Lovable `space-y-2` field rhythm. */
export function AuthField({
  htmlFor,
  label,
  hint,
  children,
  className,
}: {
  htmlFor: string;
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium leading-none">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/* Literal Lovable form-primitive classes (src/components/ui/{input,button}.tsx). */
export const authInputClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";

export const authPrimaryButtonClass =
  "inline-flex h-9 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

/** Secondary/outline control used for OAuth and passkey entry points. */
export const authOAuthButtonClass =
  "inline-flex h-9 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-transparent px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

/** Presentational wrapper so provider buttons share one visual treatment. */
export function OAuthButton({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("[&>*]:w-full", className)}>{children}</div>;
}

/** Muted footer links row (legal, cross-links). */
export function AuthFooterLinks({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-sm text-muted-foreground", className)}>{children}</p>;
}
