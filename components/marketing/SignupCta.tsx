"use client";

import Link from "next/link";
import { ArrowRight } from "@/components/design-system/icons";
import { cn } from "@/lib/cn";
import { crossAppClickHandler } from "@/lib/subdomainRouting";
import { trackSignupCtaClick, type SignupCtaPlacement } from "@/lib/analytics/funnel";

/**
 * The button that starts an account, wherever it appears.
 *
 * Every marketing surface used to hand-roll this pill inline, which meant the
 * hero, the closing band and the pricing cards could drift apart in height,
 * label and behaviour — and none of them said which one a visitor had used.
 * Routing them through one component keeps the shape identical and makes
 * `placement` a required argument, so a new entry point cannot be added without
 * declaring where it sits.
 *
 * Sizing is deliberate rather than inherited: `h-11` is 44px, the minimum
 * comfortable touch target, and the button goes full-width until `sm` so the
 * first screen on a phone offers a target that is hard to miss instead of a
 * pill floating in the left margin.
 */
export function SignupCta({
  placement,
  children = "Create your free account",
  className,
  href = "/signup",
  showArrow = true,
  tone = "primary"
}: {
  placement: SignupCtaPlacement;
  children?: React.ReactNode;
  className?: string;
  href?: string;
  showArrow?: boolean;
  /** `secondary` is for the dark closing band, where primary would vibrate. */
  tone?: "primary" | "secondary";
}) {
  return (
    <Link
      href={href}
      data-attr={`signup-cta-${placement}`}
      className={cn(
        "group inline-flex h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-full px-6 text-[15px] font-medium shadow transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto",
        tone === "primary"
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        className
      )}
      onClick={crossAppClickHandler(href, () => trackSignupCtaClick(placement))}
    >
      {children}
      {showArrow ? (
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
      ) : null}
    </Link>
  );
}

/**
 * The quiet companion to {@link SignupCta} — same height and full-width
 * behaviour so a stacked pair on a phone reads as two equal rows rather than
 * one button and one stray text link.
 */
export function SecondaryCta({
  href,
  children,
  className,
  onClick
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const isHashLink = href.startsWith("#");
  const classes = cn(
    "inline-flex h-11 w-full items-center justify-center whitespace-nowrap rounded-full px-6 text-[15px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto",
    className
  );

  // An in-page anchor must not go through the cross-app resolver: it has no
  // route to resolve and Link would fight the browser's own scroll handling.
  if (isHashLink) {
    return (
      <a href={href} className={classes} onClick={onClick}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={classes} onClick={crossAppClickHandler(href, onClick)}>
      {children}
    </Link>
  );
}
