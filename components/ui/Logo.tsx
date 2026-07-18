import Link from "next/link";
import Image from "next/image";

export function Logo({
  className,
  href = "/",
  markStyle = "bare",
  subtitle,
  variant = "full"
}: {
  className?: string;
  href?: string;
  markStyle?: "bare" | "framed";
  subtitle?: string;
  variant?: "full" | "symbol";
}) {
  return (
    <Link
      aria-label="BehalfID home"
      className={[
        "site-logo",
        `site-logo--${variant}`,
        markStyle === "framed" ? "site-logo--framed" : undefined,
        className
      ]
        .filter(Boolean)
        .join(" ")}
      href={href}
    >
      <span className="site-logo__mark" aria-hidden="true">
        <Image
          src="/icon-transparent.png"
          alt=""
          width={26}
          height={26}
          className="site-logo__icon"
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
