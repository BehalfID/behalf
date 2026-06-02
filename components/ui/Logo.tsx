import Link from "next/link";
import Image from "next/image";

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
      <span className="site-logo__mark" aria-hidden="true">
        <Image
          src="/behalf_favicon.png"
          alt=""
          width={22}
          height={22}
          className="site-logo__icon site-logo__icon--dark"
        />
        <Image
          src="/icon-light.png"
          alt=""
          width={22}
          height={22}
          className="site-logo__icon site-logo__icon--light"
        />
      </span>
      <span className="site-logo__wordmark">
        <strong className="site-logo__text">
          Behalf<span className="site-logo__slash">/</span><span className="site-logo__id">ID</span>
        </strong>
        {subtitle ? <small>{subtitle}</small> : null}
      </span>
    </Link>
  );
}
