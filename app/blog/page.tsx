import Link from "next/link";
import type { Metadata } from "next";
import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { getPostMeta } from "./posts";

export const metadata: Metadata = {
  title: "Blog — BehalfID",
  description:
    "Writing on agent permission infrastructure, fail-closed enforcement, decision boundaries, and the design of AI authorization.",
  alternates: { canonical: "/blog" }
};

export default function BlogPage() {
  const posts = getPostMeta();

  return (
    <main className="marketing">
      <PublicNav />

      <div className="blog-page">
        <header className="blog-hero">
          <p className="section-kicker">Blog</p>
          <h1>Writing on agent permission infrastructure.</h1>
          <p className="blog-lede">
            Enforcement models, decision boundaries, passport design, and the
            real cost of fail-open integrations.
          </p>
        </header>

        <div className="blog-list">
          {posts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="blog-card"
            >
              <div className="blog-card__meta">
                <span>{post.dateLabel}</span>
                <span className="blog-card__dot" aria-hidden="true" />
                <span>{post.readingTime}</span>
              </div>
              <h2 className="blog-card__title">{post.title}</h2>
              <p className="blog-card__excerpt">{post.excerpt}</p>
              <div className="blog-card__tags">
                {post.tags.map((tag) => (
                  <span key={tag} className="blog-tag">
                    {tag}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      </div>
      <PublicFooter />
    </main>
  );
}
