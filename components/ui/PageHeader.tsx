import type { ReactNode } from "react";

export type PageHeaderProps = {
  eyebrow?: ReactNode;
  breadcrumb?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  status?: ReactNode;
  tabs?: ReactNode;
  className?: string;
};

export function PageHeader({
  eyebrow,
  breadcrumb,
  title,
  description,
  action,
  primaryAction,
  secondaryActions,
  status,
  tabs,
  className
}: PageHeaderProps) {
  const hasActions = action || primaryAction || secondaryActions;

  return (
    <header className={["ui-page-header", className].filter(Boolean).join(" ")}>
      <div className="ui-page-header__body">
        <div className="ui-page-header__copy">
        {breadcrumb ? (
          <nav className="ui-page-header__breadcrumb" aria-label="Breadcrumb">
            {breadcrumb}
          </nav>
        ) : null}
        {eyebrow ? <p className="ui-kicker">{eyebrow}</p> : null}
        <div className="ui-page-header__title-row">
          <h1>{title}</h1>
          {status ? <div className="ui-page-header__status">{status}</div> : null}
        </div>
        {description ? <p>{description}</p> : null}
        </div>
        {hasActions ? (
          <div className="ui-page-header__action">
            {secondaryActions}
            {action}
            {primaryAction}
          </div>
        ) : null}
      </div>
      {tabs ? <div className="ui-page-header__tabs">{tabs}</div> : null}
    </header>
  );
}
