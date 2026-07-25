import type {
  FormHTMLAttributes,
  HTMLAttributes,
  ReactNode
} from "react";
import { ButtonLink } from "./Button";

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function List({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={classNames("ui-list", className)} {...props} />;
}

export function ListRow({
  action,
  className,
  description,
  title,
  ...props
}: Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  action?: ReactNode;
  description?: ReactNode;
  title: ReactNode;
}) {
  return (
    <div className={classNames("ui-list-row", className)} {...props}>
      <div className="ui-list-row__content">
        <span className="ui-list-row__title">{title}</span>
        {description ? <span className="ui-list-row__description">{description}</span> : null}
      </div>
      {action ? <div className="ui-list-row__action">{action}</div> : null}
    </div>
  );
}

export function MetadataList({ className, ...props }: HTMLAttributes<HTMLDListElement>) {
  return <dl className={classNames("ui-metadata-list", className)} {...props} />;
}

export function MetadataRow({
  className,
  label,
  value,
  ...props
}: HTMLAttributes<HTMLDivElement> & { label: ReactNode; value: ReactNode }) {
  return (
    <div className={classNames("ui-metadata-row", className)} {...props}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function FilterBar({ className, ...props }: FormHTMLAttributes<HTMLFormElement>) {
  return <form className={classNames("ui-filter-bar", className)} {...props} />;
}

export function Pagination({
  className,
  hrefForPage,
  page,
  totalPages
}: {
  className?: string;
  hrefForPage?: (page: number) => string;
  page: number;
  totalPages: number;
}) {
  const safeTotal = Math.max(1, totalPages);
  const safePage = Math.min(Math.max(1, page), safeTotal);
  const href = hrefForPage ?? ((nextPage: number) => `#page-${nextPage}`);

  return (
    <nav className={classNames("ui-pagination", className)} aria-label="Pagination">
      <span className="ui-pagination__meta">
        Page {safePage} of {safeTotal}
      </span>
      <div className="ui-pagination__actions">
        <ButtonLink
          aria-disabled={safePage <= 1}
          href={href(Math.max(1, safePage - 1))}
          size="small"
          variant="outline"
        >
          Previous
        </ButtonLink>
        <ButtonLink
          aria-disabled={safePage >= safeTotal}
          href={href(Math.min(safeTotal, safePage + 1))}
          size="small"
          variant="outline"
        >
          Next
        </ButtonLink>
      </div>
    </nav>
  );
}
