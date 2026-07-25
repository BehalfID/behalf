import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { PublicAuthSplitCTA } from "@/components/layout/PublicAuthSplitCTA";
import { ButtonLink } from "@/components/ui";
import { getPost, posts } from "../posts";

export function generateStaticParams() {
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};
  return {
    title: `${post.title} — BehalfID`,
    description: post.excerpt,
    alternates: { canonical: `/blog/${post.slug}` }
  };
}

export default async function BlogPostPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  return (
    <main id="main-content" className="marketing" tabIndex={-1}>
      <PublicNav />

      <div className="blog-post-page">
        <nav className="blog-breadcrumb" aria-label="Breadcrumb">
          <Link href="/blog">Blog</Link>
          <span aria-hidden="true">/</span>
          <span>{post.title}</span>
        </nav>

        <article className="blog-post">
          <header className="blog-post__header">
            <div className="blog-post__meta">
              <span>{post.dateLabel}</span>
              <span className="blog-card__dot" aria-hidden="true" />
              <span>{post.readingTime}</span>
            </div>
            <h1 className="blog-post__title">{post.title}</h1>
            <p className="blog-post__excerpt">{post.excerpt}</p>
            <div className="blog-card__tags">
              {post.tags.map((tag) => (
                <span key={tag} className="blog-tag">
                  {tag}
                </span>
              ))}
            </div>
          </header>

          <div className="blog-prose">{post.content}</div>
        </article>

        <div className="blog-post__footer">
          <Link href="/blog" className="blog-back">
            ← All posts
          </Link>
          <div className="hero__actions">
            <PublicAuthSplitCTA leftLabel="Build" leftHref="/signup" />
            <ButtonLink href="/docs">Read the docs</ButtonLink>
          </div>
        </div>
      </div>

      <PublicFooter />
    </main>
  );
}
