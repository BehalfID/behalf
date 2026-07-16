"use client";

import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, MouseEvent, ReactNode } from "react";
import { haptic } from "@/lib/haptic";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "destructive"
  | "danger";

export type ButtonSize = "small" | "default" | "large" | "icon";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
};

type ButtonLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
};

function buttonClassName(variant: ButtonVariant, size: ButtonSize, className?: string) {
  return [
    "ui-button",
    `ui-button--${variant}`,
    size !== "default" ? `ui-button--${size}` : undefined,
    className
  ]
    .filter(Boolean)
    .join(" ");
}

function hapticForVariant(variant: ButtonVariant) {
  if (variant === "primary" || variant === "danger" || variant === "destructive") {
    return "medium" as const;
  }
  return "light" as const;
}

function LoadingSpinner() {
  return <span className="ui-button__spinner" aria-hidden="true" />;
}

export function Button({
  children,
  className,
  variant = "secondary",
  size = "default",
  loading = false,
  disabled,
  onClick,
  ...props
}: ButtonProps) {
  function handleClick(e: MouseEvent<HTMLButtonElement>) {
    if (!disabled && !loading) haptic(hapticForVariant(variant));
    onClick?.(e);
  }

  return (
    <button
      aria-busy={loading || undefined}
      className={buttonClassName(variant, size, className)}
      disabled={disabled || loading}
      onClick={handleClick}
      {...props}
    >
      {loading ? <LoadingSpinner /> : null}
      {children}
    </button>
  );
}

export function ButtonLink({
  children,
  className,
  variant = "secondary",
  size = "default",
  loading = false,
  href,
  "aria-disabled": ariaDisabled,
  tabIndex,
  onClick,
  ...props
}: ButtonLinkProps) {
  const disabled = loading || ariaDisabled === true || ariaDisabled === "true";

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    if (disabled) {
      e.preventDefault();
      return;
    }
    haptic(hapticForVariant(variant));
    onClick?.(e);
  }

  return (
    <Link
      aria-busy={loading || undefined}
      aria-disabled={disabled || undefined}
      className={buttonClassName(variant, size, className)}
      href={href}
      onClick={handleClick}
      tabIndex={disabled ? -1 : tabIndex}
      {...props}
    >
      {loading ? <LoadingSpinner /> : null}
      {children}
    </Link>
  );
}
