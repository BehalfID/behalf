import type {
  HTMLAttributes,
  TableHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes
} from "react";

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function TableContainer({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={classNames("ui-table-shell", className)} {...props} />;
}

export function Table({
  className,
  density = "default",
  ...props
}: TableHTMLAttributes<HTMLTableElement> & { density?: "default" | "compact" }) {
  return (
    <table
      className={classNames(
        "ui-table",
        density === "compact" && "ui-table--compact",
        className
      )}
      {...props}
    />
  );
}

export function TableHeader({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={classNames("ui-table__header", className)} {...props} />;
}

export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={classNames("ui-table__body", className)} {...props} />;
}

export function TableFooter({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tfoot className={classNames("ui-table__footer", className)} {...props} />;
}

export function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={classNames("ui-table-row", className)} {...props} />;
}

export function TableHead({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={classNames("ui-table__head", className)} scope="col" {...props} />;
}

export function TableCell({
  className,
  numeric = false,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <td
      className={classNames("ui-table__cell", numeric && "ui-table__numeric", className)}
      {...props}
    />
  );
}

export function TableCaption({ className, ...props }: HTMLAttributes<HTMLTableCaptionElement>) {
  return <caption className={classNames("ui-table__caption", className)} {...props} />;
}
