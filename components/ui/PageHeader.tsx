import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  className
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header className={["ui-page-header", className].filter(Boolean).join(" ")}>
      <div>
        {eyebrow ? <p className="ui-kicker">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div className="ui-page-header__action">{action}</div> : null}
    </header>
  );
}
