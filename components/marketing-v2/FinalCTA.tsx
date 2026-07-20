import { ButtonLink } from "@/components/ui";
import styles from "@/app/home-v2/home-v2.module.css";
import { ArrowRightIcon } from "./icons";

export function FinalCTA() {
  return (
    <section className={`${styles.container} ${styles.section}`}>
      <div className={styles.finalCta}>
        <p className={styles.finalQuote}>
          Your agents already have access. <em>BehalfID determines whether they have authority.</em>
        </p>
        <p className={styles.finalSub}>
          Give every agent an identity, define its permissions, and require approval before sensitive actions are
          executed.
        </p>
        <div className={styles.finalActions}>
          <ButtonLink href="/signup" size="large" variant="primary">
            Start securing agents
            <ArrowRightIcon size={16} />
          </ButtonLink>
          {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? (
            <ButtonLink href="/api/auth/google?mode=signup" size="large" variant="outline">
              Continue with Google
            </ButtonLink>
          ) : (
            <ButtonLink href="/docs/concepts" size="large" variant="outline">
              Read the technical overview
            </ButtonLink>
          )}
        </div>
      </div>
    </section>
  );
}
