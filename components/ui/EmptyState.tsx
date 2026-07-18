import type { HTMLAttributes, ReactNode } from "react";

export function EmptyState({
  action,
  children,
  className,
  description,
  icon,
  title,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  action?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  title?: ReactNode;
}) {
  const classes = ["ui-empty", className].filter(Boolean).join(" ");

  if (!title && !description && !icon && !action) {
    return (
      <div className={classes} {...props}>
        {children}
      </div>
    );
  }

  return (
    <div className={classes} {...props}>
      <div className="ui-empty__content">
        {icon ? <span className="ui-empty__icon" aria-hidden="true">{icon}</span> : null}
        {title ? <h3 className="ui-empty__title">{title}</h3> : null}
        {description ? <p className="ui-empty__description">{description}</p> : null}
        {children}
        {action ? <div className="ui-empty__action">{action}</div> : null}
      </div>
    </div>
  );
}
