"use client";

import { useState } from "react";
import type { HTMLAttributes } from "react";

type CodeBlockProps = HTMLAttributes<HTMLPreElement> & {
  label?: string;
};

export function CodeBlock({ className, label = "Code", children, ...props }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    const text = typeof children === "string" ? children : "";
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="ui-code-shell">
      <div className="ui-code-bar">
        <span className="ui-code-label">{label}</span>
        <button
          type="button"
          className={["ui-code-copy", copied ? "ui-code-copy--ok" : ""].filter(Boolean).join(" ")}
          onClick={copy}
          aria-label="Copy code"
        >
          {copied ? (
            <>
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                <path d="M1.5 5.5l3 3 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                <rect x="3.5" y="1" width="6.5" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                <path d="M1 4.5v5A1.5 1.5 0 002.5 11H8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>
      <pre className={["ui-code", className].filter(Boolean).join(" ")} {...props}>{children}</pre>
    </div>
  );
}
