import { ButtonLink } from "@/components/ui";
import { ContinueWithGoogle } from "@/components/auth/ContinueWithGoogle";
import styles from "@/app/home-v2/home-v2.module.css";
import { ArrowRightIcon } from "./icons";

export function FinalCTA({ googleEnabled = false }: { googleEnabled?: boolean }) {
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
          {googleEnabled ? (
            <ContinueWithGoogle className="auth-google-button--compact" mode="signup" size="large" variant="outline" />
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
