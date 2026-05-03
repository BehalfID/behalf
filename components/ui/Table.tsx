import type { HTMLAttributes } from "react";

export function Table({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={["ui-table", className].filter(Boolean).join(" ")} {...props} />;
}

export function TableRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={["ui-table-row", className].filter(Boolean).join(" ")} {...props} />;
}
