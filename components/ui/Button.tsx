import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

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

export function Button({ className, variant = "secondary", ...props }: ButtonProps) {
  return <button className={buttonClassName(variant, className)} {...props} />;
}

export function ButtonLink({ className, variant = "secondary", href, ...props }: ButtonLinkProps) {
  return <Link className={buttonClassName(variant, className)} href={href} {...props} />;
}
