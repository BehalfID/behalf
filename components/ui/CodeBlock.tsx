import type { HTMLAttributes } from "react";

export function CodeBlock({ className, ...props }: HTMLAttributes<HTMLPreElement>) {
  return <pre className={["ui-code", className].filter(Boolean).join(" ")} {...props} />;
}
