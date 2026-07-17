import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";

export default function StatusLoading() {
  return (
    <main id="main-content" className="marketing" tabIndex={-1} aria-busy="true">
      <PublicNav />
      <div className="status-page status-loading">
        <p className="sr-only" role="status">Loading service status</p>
        <div className="status-loading__banner public-skeleton" />
        <section className="status-section">
          <div className="status-loading__heading public-skeleton" />
          <div className="status-loading__rows">
            <div className="public-skeleton" />
            <div className="public-skeleton" />
            <div className="public-skeleton" />
          </div>
        </section>
        <section className="status-section">
          <div className="status-loading__heading public-skeleton" />
          <div className="status-loading__incident public-skeleton" />
        </section>
      </div>
      <PublicFooter />
    </main>
  );
}
