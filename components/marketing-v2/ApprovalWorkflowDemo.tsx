import styles from "@/app/home-v2/home-v2.module.css";
import { APPROVAL_INBOX } from "./data";
import { CheckIcon, PauseIcon, UserIcon } from "./icons";

export function ApprovalWorkflowDemo() {
  return (
    <section className={`${styles.container} ${styles.section}`}>
      <div className={`${styles.split} ${styles.splitReverse}`}>
        <div className={styles.panel}>
          <div className={styles.profileHead}>
            <span className={styles.profileName}>
              Approval inbox
              <span>2 actions waiting on a human decision</span>
            </span>
            <span className={`${styles.badge} ${styles.badgeWarn}`}>
              <PauseIcon size={11} strokeWidth={2.4} />
              PENDING
            </span>
          </div>

          {APPROVAL_INBOX.map((item, i) => (
            <div key={i} className={styles.inboxItem}>
              <div className={styles.inboxHead}>
                <span className={styles.inboxAgent}>
                  <UserIcon size={15} />
                  {item.agent}
                </span>
                <span className={`${styles.badge} ${styles.badgeWarn}`}>APPROVAL REQUIRED</span>
              </div>
              <div className={styles.inboxMeta}>
                <div>
                  <span>Action</span>
                  <code>{item.action}</code>
                </div>
                <div>
                  <span>Resource</span>
                  <code>{item.resource}</code>
                </div>
                <div>
                  <span>Amount</span>
                  <code>{item.amount}</code>
                </div>
                <div>
                  <span>Required authority</span>
                  <code>{item.authority}</code>
                </div>
              </div>
              <div className={styles.inboxActions}>
                <span className={styles.inboxApprove}>
                  <CheckIcon size={14} strokeWidth={2.4} /> Approve
                </span>
                <span className={styles.inboxDeny}>Deny</span>
              </div>
            </div>
          ))}

          <p className={styles.inboxNote}>
            A requester cannot approve their own request. Grants are bound to the specific action and expire after use.
          </p>
        </div>

        <div className={styles.splitText}>
          <p className={styles.kicker}>Approval workflow</p>
          <h2 className={styles.h2}>Put a human decision in front of sensitive actions.</h2>
          <p className={styles.lede}>
            Sensitive actions pause before execution. The approver sees the full context of the request and can approve
            or deny it — nothing runs until they do.
          </p>
          <ul className={styles.featureList}>
            <li>
              <span className={styles.featureTick}>
                <CheckIcon size={17} strokeWidth={2.2} />
              </span>
              Approvers see the agent, action, resource, and risk context
            </li>
            <li>
              <span className={styles.featureTick}>
                <CheckIcon size={17} strokeWidth={2.2} />
              </span>
              Approval authority can be delegated by role
            </li>
            <li>
              <span className={styles.featureTick}>
                <CheckIcon size={17} strokeWidth={2.2} />
              </span>
              Requesters cannot approve their own requests
            </li>
            <li>
              <span className={styles.featureTick}>
                <CheckIcon size={17} strokeWidth={2.2} />
              </span>
              Grants are single-use and time-limited where supported
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
