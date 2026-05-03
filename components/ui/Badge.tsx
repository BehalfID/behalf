import type { HTMLAttributes } from "react";

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={["ui-badge", className].filter(Boolean).join(" ")} {...props} />;
}
