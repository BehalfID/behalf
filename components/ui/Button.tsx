"use client";

import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, MouseEvent, ReactNode } from "react";
import { haptic } from "@/lib/haptic";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

type ButtonLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  children: ReactNode;
  variant?: ButtonVariant;
};

function buttonClassName(variant: ButtonVariant, className?: string) {
  return ["ui-button", `ui-button--${variant}`, className].filter(Boolean).join(" ");
}

function hapticForVariant(variant: ButtonVariant) {
  if (variant === "primary" || variant === "danger") return "medium" as const;
  return "light" as const;
}

export function Button({ className, variant = "secondary", onClick, ...props }: ButtonProps) {
  function handleClick(e: MouseEvent<HTMLButtonElement>) {
    if (!props.disabled) haptic(hapticForVariant(variant));
    onClick?.(e);
  }
  return (
    <button
      className={buttonClassName(variant, className)}
      onClick={handleClick}
      {...props}
    />
  );
}

export function ButtonLink({ className, variant = "secondary", href, onClick, ...props }: ButtonLinkProps) {
  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    haptic(hapticForVariant(variant));
    onClick?.(e);
  }
  return (
    <Link
      className={buttonClassName(variant, className)}
      href={href}
      onClick={handleClick}
      {...props}
    />
  );
}
