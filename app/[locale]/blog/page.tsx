import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Metadata } from "next";
import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { getPostMeta } from "../../blog/posts";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "blog.meta" });
  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: "/blog" }
  };
}

export default async function BlogPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "blog" });
  const posts = getPostMeta();

  return (
    <main id="main-content" className="marketing" tabIndex={-1}>
      <PublicNav />

      <div className="blog-page">
        <header className="blog-hero">
          <p className="section-kicker">{t("kicker")}</p>
          <h1>{t("title")}</h1>
          <p className="blog-lede">{t("lede")}</p>
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
                  <span key={tag} className="blog-tag">{tag}</span>
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
