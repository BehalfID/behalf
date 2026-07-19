import type { HTMLAttributes } from "react";
import { Skeleton } from "./Feedback";

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export type PageLoadingVariant =
  | "overview"
  | "table"
  | "detail"
  | "settings"
  | "form"
  | "activity";

export function SkeletonText({
  className,
  lines = 3,
  widths = ["100%", "82%", "64%"]
}: {
  className?: string;
  lines?: number;
  widths?: string[];
}) {
  return (
    <span className={classNames("ui-skeleton-text", className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          className="ui-skeleton-text__line"
          key={index}
          style={{ width: widths[index % widths.length] }}
        />
      ))}
    </span>
  );
}

export function SkeletonCard({
  className,
  lines = 3
}: {
  className?: string;
  lines?: number;
}) {
  return (
    <div className={classNames("ui-skeleton-card", className)} aria-hidden="true">
      <div className="ui-skeleton-card__header">
        <Skeleton className="ui-skeleton-card__title" />
        <Skeleton className="ui-skeleton-card__badge" />
      </div>
      <SkeletonText lines={lines} />
    </div>
  );
}

export function SkeletonList({
  className,
  rows = 4
}: {
  className?: string;
  rows?: number;
}) {
  return (
    <div className={classNames("ui-skeleton-list", className)} aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div className="ui-skeleton-list__row" key={index}>
          <Skeleton className="ui-skeleton-list__leading" />
          <span className="ui-skeleton-list__copy">
            <Skeleton />
            <Skeleton />
          </span>
          <Skeleton className="ui-skeleton-list__status" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({
  className,
  columns = 5,
  rows = 5,
  toolbar = true
}: {
  className?: string;
  columns?: number;
  rows?: number;
  toolbar?: boolean;
}) {
  return (
    <div className={classNames("ui-skeleton-table", className)} aria-hidden="true">
      {toolbar ? (
        <div className="ui-skeleton-table__toolbar">
          <Skeleton className="ui-skeleton-table__search" />
          <Skeleton className="ui-skeleton-table__filter" />
          <Skeleton className="ui-skeleton-table__action" />
        </div>
      ) : null}
      <div className="ui-skeleton-table__shell">
        <div
          className="ui-skeleton-table__row ui-skeleton-table__row--header"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: columns }, (_, index) => <Skeleton key={index} />)}
        </div>
        {Array.from({ length: rows }, (_, row) => (
          <div
            className="ui-skeleton-table__row"
            key={row}
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: columns }, (_, column) => (
              <Skeleton key={column} style={{ width: column === 0 ? "72%" : "100%" }} />
            ))}
          </div>
        ))}
        <div className="ui-skeleton-table__footer">
          <Skeleton />
          <Skeleton />
        </div>
      </div>
    </div>
  );
}

function SkeletonPageHeader() {
  return (
    <div className="ui-page-loading__header" aria-hidden="true">
      <div className="ui-page-loading__header-copy">
        <Skeleton className="ui-page-loading__eyebrow" />
        <Skeleton className="ui-page-loading__title" />
        <Skeleton className="ui-page-loading__description" />
      </div>
      <Skeleton className="ui-page-loading__header-action" />
    </div>
  );
}

function OverviewGeometry() {
  return (
    <>
      <div className="ui-page-loading__metric-strip" aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => (
          <span key={index}><Skeleton /><Skeleton /></span>
        ))}
      </div>
      <div className="ui-page-loading__overview-grid">
        <SkeletonCard lines={4} />
        <SkeletonCard lines={4} />
        <SkeletonCard lines={5} />
        <SkeletonCard lines={3} />
      </div>
      <div className="ui-page-loading__usage-grid" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => <SkeletonCard lines={2} key={index} />)}
      </div>
    </>
  );
}

function DetailGeometry() {
  return (
    <>
      <div className="ui-page-loading__identity" aria-hidden="true">
        <Skeleton className="ui-page-loading__avatar" />
        <SkeletonText className="ui-page-loading__identity-copy" lines={3} widths={["44%", "70%", "56%"]} />
        <Skeleton className="ui-page-loading__identity-action" />
      </div>
      <div className="ui-page-loading__tabs" aria-hidden="true">
        <Skeleton /><Skeleton /><Skeleton /><Skeleton />
      </div>
      <div className="ui-page-loading__detail-grid">
        <SkeletonCard lines={6} />
        <SkeletonCard lines={5} />
      </div>
    </>
  );
}

function SettingsGeometry() {
  return (
    <div className="ui-page-loading__settings">
      <div className="ui-page-loading__settings-nav" aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => <Skeleton key={index} />)}
      </div>
      <div className="ui-page-loading__settings-content">
        <SkeletonCard lines={5} />
        <SkeletonCard lines={7} />
        <SkeletonCard lines={4} />
      </div>
    </div>
  );
}

function FormGeometry() {
  return (
    <div className="ui-page-loading__form" aria-hidden="true">
      <SkeletonText lines={2} widths={["38%", "74%"]} />
      <div className="ui-page-loading__form-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <span key={index}><Skeleton /><Skeleton /></span>
        ))}
      </div>
      <Skeleton className="ui-page-loading__form-action" />
    </div>
  );
}

export function PageLoadingState({
  className,
  label = "Loading page content",
  variant = "overview",
  ...props
}: Omit<HTMLAttributes<HTMLElement>, "children"> & {
  label?: string;
  variant?: PageLoadingVariant;
}) {
  return (
    <section
      aria-busy="true"
      aria-live="polite"
      className={classNames("ui-page-loading", `ui-page-loading--${variant}`, className)}
      role="status"
      {...props}
    >
      <span className="sr-only">{label}</span>
      <SkeletonPageHeader />
      {variant === "overview" ? <OverviewGeometry /> : null}
      {variant === "table" || variant === "activity" ? (
        <SkeletonTable columns={variant === "activity" ? 6 : 5} rows={variant === "activity" ? 6 : 5} />
      ) : null}
      {variant === "detail" ? <DetailGeometry /> : null}
      {variant === "settings" ? <SettingsGeometry /> : null}
      {variant === "form" ? <FormGeometry /> : null}
    </section>
  );
}

export function SectionLoadingState({
  className,
  label = "Loading section",
  rows = 4,
  ...props
}: Omit<HTMLAttributes<HTMLElement>, "children"> & {
  label?: string;
  rows?: number;
}) {
  return (
    <section
      aria-busy="true"
      aria-live="polite"
      className={classNames("ui-section-loading", className)}
      role="status"
      {...props}
    >
      <span className="sr-only">{label}</span>
      <SkeletonList rows={rows} />
    </section>
  );
}

export function RefreshingIndicator({
  className,
  label = "Refreshing data",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { label?: string }) {
  return (
    <span className={classNames("ui-refreshing-indicator", className)} role="status" {...props}>
      <span className="ui-spinner" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
