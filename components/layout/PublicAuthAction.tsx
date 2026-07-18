"use client";

import type { AnchorHTMLAttributes } from "react";
import NextLink from "next/link";
import { Link as LocalizedLink } from "@/i18n/navigation";
import type { PublicAuthAction as PublicAuthActionValue } from "@/lib/publicAuthAction";

type PublicAuthActionProps = Pick<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "className" | "onClick"
> & {
  action: PublicAuthActionValue;
  localizeUnauthenticated?: boolean;
};

export function PublicAuthAction({
  action,
  className,
  localizeUnauthenticated = false,
  onClick
}: PublicAuthActionProps) {
  const sharedProps = {
    "aria-label": action.label,
    className,
    href: action.href,
    onClick
  };

  if (!action.isAuthenticated && localizeUnauthenticated) {
    return <LocalizedLink {...sharedProps}>{action.label}</LocalizedLink>;
  }

  return <NextLink {...sharedProps}>{action.label}</NextLink>;
}
