"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { MarketingHeader } from "@/components/design-system/MarketingHeader";
import { MarketingFooter } from "@/components/design-system/MarketingFooter";
import { SlashSeam } from "@/components/design-system/marketing-visuals";
import { ArrowRight } from "@/components/design-system/icons";
import { cn } from "@/lib/cn";
import { crossAppClickHandler } from "@/lib/subdomainRouting";
import type { PublicAuthAction } from "@/lib/publicAuthAction";

export function MarketingLayout({
  children,
  authAction,
  googleEnabled = false,
  showEnding = true
}: {
  children: ReactNode;
  authAction: PublicAuthAction;
  googleEnabled?: boolean;
  showEnding?: boolean;
}) {
  return (
    <div className="ds min-h-dvh">
      <MarketingHeader authAction={authAction} googleEnabled={googleEnabled} />
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
      {showEnding ? <MarketingEnding /> : null}
      <MarketingFooter />
    </div>
  );
}

function MarketingEnding() {
  return (
    <div className="dark">
      <div className="env-copper-field relative overflow-hidden">
        <SlashSeam className="absolute inset-x-0 top-0 opacity-40" />
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-24 sm:px-8 sm:py-32 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-end">
          <h2 className="display-xl max-w-[16ch]">
            Give agents room to work.
            <span className="block opacity-70">Keep the final say.</span>
          </h2>
          <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-surface px-6 py-3 text-[15px] font-medium text-foreground"
              onClick={crossAppClickHandler("/signup")}
            >
              Start building <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center rounded-full px-6 py-3 text-[15px] font-medium text-foreground hover:bg-surface"
              onClick={crossAppClickHandler("/contact")}
            >
              Talk to us
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Section({
  children,
  className,
  id,
  bleed,
  wide
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  bleed?: boolean;
  wide?: boolean;
}) {
  return (
    <section id={id} className={className}>
      <div
        className={cn(
          "mx-auto px-5 sm:px-8",
          wide ? "max-w-7xl" : "max-w-6xl",
          bleed ? "" : "py-24 sm:py-32"
        )}
      >
        {children}
      </div>
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  className
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("max-w-2xl", className)}>
      {eyebrow ? (
        <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-primary">{eyebrow}</div>
      ) : null}
      <h2 className="display-lg mt-4">{title}</h2>
      {description ? (
        <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}
