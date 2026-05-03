import Image from "next/image";
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
    <Link className={`site-logo site-logo--${variant}`} href={href}>
      <span className="site-logo__mark" aria-hidden="true">
        <Image alt="" height={24} src="/behalf_symbols.png" width={24} />
      </span>
      <span className="site-logo__wordmark">
        {variant === "full" ? (
          <strong className="site-logo__text">
            Behalf<span>ID</span>
          </strong>
        ) : (
          <strong className="site-logo__text">
            Behalf<span>ID</span>
          </strong>
        )}
        {subtitle ? <small>{subtitle}</small> : null}
      </span>
    </Link>
  );
}
