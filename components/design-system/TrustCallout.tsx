"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { crossAppClickHandler } from "@/lib/subdomainRouting";

/**
 * Data-handling + enforcement-guarantee line that sits next to a primary CTA.
 *
 * The substance (TLS, SHA-256 key hashes, scrypt, "we never sell or train on
 * your data") is documented in /privacy and /security, and the fail-closed
 * guarantee in the enforcement-boundary block — but a buyer reads none of that
 * before clicking. This puts one line of it where the click happens.
 *
 * The wording is deliberately scoped to "at the integration point": BehalfID is
 * not universally fail-closed and must not be described that way (see
 * /docs/concepts and /security for the per-path outage semantics).
 */
export function TrustCallout({ className, tone = "default" }: { className?: string; tone?: "default" | "compact" }) {
  return (
    <p
      className={cn(
        "leading-relaxed text-muted-foreground",
        tone === "compact" ? "text-[12px]" : "text-[13px]",
        className
      )}
    >
      Fail-closed at the integration point. TLS everywhere, keys stored as hashes, we never sell or train on your
      data.{" "}
      <Link
        href="/security"
        className="text-primary underline underline-offset-2 hover:no-underline"
        onClick={crossAppClickHandler("/security")}
      >
        How enforcement and data handling work
      </Link>
      .
    </p>
  );
}
