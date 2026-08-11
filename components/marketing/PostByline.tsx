import Link from "next/link";
import { BLOG_AUTHOR } from "@/lib/founders";

/**
 * Blog byline.
 *
 * Posts in this repo carry no per-post author field, so every post is
 * attributed to the team and linked to /about, where the founders are named.
 * Attributing an unsigned post to a specific founder would be inventing
 * authorship — if a post gains a real author, render that instead.
 */
export function PostByline({ variant = "full" }: { variant?: "full" | "compact" }) {
  if (variant === "compact") {
    return <span>{BLOG_AUTHOR}</span>;
  }

  return (
    <div className="blog-post__byline">
      <span>
        By <Link href="/about">{BLOG_AUTHOR}</Link>
      </span>
    </div>
  );
}
