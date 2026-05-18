import Link from "next/link";

export function Logo({
  href = "/",
  subtitle,
  variant = "full"
}: {
  href?: string;
  subtitle?: string;
  variant?: "full" | "symbol";
}) {
  return (
    <Link aria-label="BehalfID home" className={`site-logo site-logo--${variant}`} href={href}>
      <span className="site-logo__wordmark">
        <strong className="site-logo__text">
          Behalf<span className="site-logo__slash">/</span><span className="site-logo__id">ID</span>
        </strong>
        {subtitle ? <small>{subtitle}</small> : null}
      </span>
    </Link>
  );
}
