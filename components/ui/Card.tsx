import type { HTMLAttributes } from "react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={["ui-card", className].filter(Boolean).join(" ")} {...props} />;
}
