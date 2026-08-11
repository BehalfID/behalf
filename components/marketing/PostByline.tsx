import Image from "next/image";
import Link from "next/link";
import { FOUNDER, bylineName, isFounderNamed } from "@/lib/founder";

/**
 * Byline for blog posts. A named, linkable author is part of the same
 * vendor-anonymity fix as /about — posts arguing about enforcement models carry
 * more weight when a person's name is on them.
 *
 * Degrades to "The BehalfID team" while lib/founder.ts is unfilled.
 */
export function PostByline({ variant = "full" }: { variant?: "full" | "compact" }) {
  const name = bylineName();
  const named = isFounderNamed();

  if (variant === "compact") {
    return <span>{name}</span>;
  }

  return (
    <div className="blog-post__byline">
      {named && FOUNDER.photo ? (
        <Image
          src={FOUNDER.photo}
          alt={FOUNDER.photoAlt || `${FOUNDER.name}, ${FOUNDER.role} of BehalfID`}
          width={36}
          height={36}
          className="blog-post__byline-avatar"
        />
      ) : null}
      <span>
        By <Link href="/about">{name}</Link>
        {named ? `, ${FOUNDER.role} of BehalfID` : ""}
      </span>
    </div>
  );
}
