import type { HTMLAttributes } from "react";

type CodeBlockProps = HTMLAttributes<HTMLPreElement> & {
  label?: string;
};

export function CodeBlock({ className, label = "Code", children, ...props }: CodeBlockProps) {
  return (
    <div className="ui-code-shell">
      <div className="ui-code-bar">
        <span>{label}</span>
      </div>
      <pre className={["ui-code", className].filter(Boolean).join(" ")} {...props}>
        {children}
      </pre>
    </div>
  );
}
