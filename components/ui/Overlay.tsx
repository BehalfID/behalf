"use client";

import Link from "next/link";
import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode
} from "react";
import { Button } from "./Button";

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function Dialog({
  children,
  className,
  description,
  footer,
  title,
  trigger
}: {
  children: ReactNode;
  className?: string;
  description?: ReactNode;
  footer?: (close: () => void) => ReactNode;
  title: ReactNode;
  trigger: (open: () => void) => ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const open = () => setIsOpen(true);
  const close = () => setIsOpen(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  return (
    <>
      {trigger(open)}
      <dialog
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        className={classNames("ui-dialog", className)}
        onCancel={() => setIsOpen(false)}
        onClose={() => setIsOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        ref={dialogRef}
      >
        <header className="ui-dialog__header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? (
              <p className="ui-dialog__description" id={descriptionId}>{description}</p>
            ) : null}
          </div>
          <Button aria-label="Close dialog" onClick={close} size="icon" type="button" variant="ghost">
            <span aria-hidden="true">×</span>
          </Button>
        </header>
        <div className="ui-dialog__body">{children}</div>
        <footer className="ui-dialog__footer">
          {footer ? footer(close) : (
            <Button onClick={close} type="button" variant="outline">Close</Button>
          )}
        </footer>
      </dialog>
    </>
  );
}

export function Dropdown({
  children,
  className,
  label
}: {
  children: ReactNode;
  className?: string;
  label: ReactNode;
}) {
  return (
    <details className={classNames("ui-dropdown", className)}>
      <summary className="ui-button ui-button--outline ui-button--small">
        {label}
        <span aria-hidden="true">⌄</span>
      </summary>
      <div className="ui-dropdown__content" role="menu">{children}</div>
    </details>
  );
}

export function DropdownItem({
  className,
  onClick,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={classNames("ui-dropdown__item", className)}
      onClick={(event) => {
        event.currentTarget.closest("details")?.removeAttribute("open");
        onClick?.(event);
      }}
      role="menuitem"
      type="button"
      {...props}
    />
  );
}

export function DropdownLink({
  className,
  href,
  onClick,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <Link
      className={classNames("ui-dropdown__item", className)}
      href={href}
      onClick={(event) => {
        event.currentTarget.closest("details")?.removeAttribute("open");
        onClick?.(event);
      }}
      role="menuitem"
      {...props}
    />
  );
}

export function Popover({
  children,
  className,
  label
}: {
  children: ReactNode;
  className?: string;
  label: ReactNode;
}) {
  return (
    <details className={classNames("ui-popover", className)}>
      <summary className="ui-button ui-button--outline ui-button--small">{label}</summary>
      <div className="ui-popover__content">{children}</div>
    </details>
  );
}

export function Tooltip({
  children,
  className,
  content
}: {
  children: ReactElement<{ "aria-describedby"?: string }>;
  className?: string;
  content: ReactNode;
}) {
  const tooltipId = useId();
  const trigger = isValidElement(children)
    ? cloneElement(children, {
        "aria-describedby": [children.props["aria-describedby"], tooltipId].filter(Boolean).join(" ")
      })
    : children;

  return (
    <span className={classNames("ui-tooltip", className)}>
      {trigger}
      <span className="ui-tooltip__content" id={tooltipId} role="tooltip">{content}</span>
    </span>
  );
}

type ToastTone = "neutral" | "success" | "warning" | "destructive";

const TOAST_SYMBOL: Record<ToastTone, string> = {
  neutral: "i",
  success: "✓",
  warning: "!",
  destructive: "×"
};

export function Toast({
  className,
  description,
  onDismiss,
  title,
  tone = "neutral",
  ...props
}: Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  description?: ReactNode;
  onDismiss?: () => void;
  title: ReactNode;
  tone?: ToastTone;
}) {
  return (
    <div
      className={classNames("ui-toast", tone !== "neutral" && `ui-toast--${tone}`, className)}
      role={tone === "destructive" ? "alert" : "status"}
      {...props}
    >
      <span className="ui-toast__mark" aria-hidden="true">{TOAST_SYMBOL[tone]}</span>
      <span className="ui-toast__content">
        <strong>{title}</strong>
        {description ? <span>{description}</span> : null}
      </span>
      {onDismiss ? (
        <Button aria-label="Dismiss notification" onClick={onDismiss} size="icon" type="button" variant="ghost">
          <span aria-hidden="true">×</span>
        </Button>
      ) : null}
    </div>
  );
}
