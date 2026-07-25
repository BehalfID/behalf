"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "@/app/home-v2/home-v2.module.css";
import { DEV_INTEGRATIONS } from "./data";
import { ArrowRightIcon } from "./icons";

const TOKEN_CLASS: Record<string, string> = {
  comment: styles.codeComment,
  keyword: styles.codeKeyword,
  string: styles.codeString,
  fn: styles.codeFn,
  plain: ""
};

export function DeveloperIntegration() {
  const [active, setActive] = useState(DEV_INTEGRATIONS[0].id);
  const current = DEV_INTEGRATIONS.find((d) => d.id === active) ?? DEV_INTEGRATIONS[0];

  return (
    <section id="developers" className={`${styles.container} ${styles.section}`} aria-labelledby="dev-heading">
      <p className={styles.kicker}>Developer integration</p>
      <h2 id="dev-heading" className={styles.h2}>
        Verify an action before your agent executes it.
      </h2>
      <p className={styles.lede}>
        The agent proposes an action, your application asks BehalfID, and it proceeds only if the decision is allowed.
        The fail-closed check lives in your code — not in the model&apos;s memory.
      </p>

      <div style={{ marginTop: 36 }}>
        <div className={styles.devTabs} role="tablist" aria-label="Integration method">
          {DEV_INTEGRATIONS.map((d) => (
            <button
              key={d.id}
              role="tab"
              aria-selected={active === d.id}
              className={`${styles.devTab} ${active === d.id ? styles.devTabActive : ""}`}
              onClick={() => setActive(d.id)}
            >
              {d.label}
            </button>
          ))}
        </div>

        <div className={styles.codeBlock}>
          <div className={styles.codeBar}>
            <span className={styles.codeDots}>
              <span />
              <span />
              <span />
            </span>
            <span className={styles.codeLabel}>{current.codeLabel}</span>
          </div>
          <pre className={styles.codePre}>
            <code>
              {current.code.map((line, i) => (
                <span key={i}>
                  {line.length === 0
                    ? "\u00A0"
                    : line.map((tok, j) => (
                        <span key={j} className={TOKEN_CLASS[tok.type]}>
                          {tok.text}
                        </span>
                      ))}
                  {"\n"}
                </span>
              ))}
            </code>
          </pre>
        </div>

        <div className={styles.devFoot}>
          <Link href={current.href} className={styles.devLink}>
            {current.label} reference <ArrowRightIcon size={14} />
          </Link>
          <Link href="/docs/quickstart" className={styles.devLink}>
            Quickstart <ArrowRightIcon size={14} />
          </Link>
        </div>
      </div>
    </section>
  );
}
