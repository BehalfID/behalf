import styles from "@/app/home-v2/home-v2.module.css";
import { Badge, Card } from "@/components/ui";
import { APPROVAL_INBOX } from "./data";
import { CheckIcon, PauseIcon, UserIcon } from "./icons";

export function ApprovalWorkflowMockup() {
  return (
    <Card className={styles.panel}>
      <div className={styles.profileHead}>
        <span className={styles.profileName}>
          Approval inbox
          <span>1 action waiting on a human decision</span>
        </span>
        <Badge className={`${styles.badge} ${styles.badgeWarn}`} variant="warning">
          <PauseIcon size={11} strokeWidth={2.4} />
          PENDING
        </Badge>
      </div>

      {APPROVAL_INBOX.slice(0, 1).map((item) => (
        <div key={item.action} className={styles.inboxItem}>
          <div className={styles.inboxHead}>
            <span className={styles.inboxAgent}>
              <UserIcon size={15} />
              {item.agent}
            </span>
            <Badge className={`${styles.badge} ${styles.badgeWarn}`} variant="warning">APPROVAL REQUIRED</Badge>
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
        Requesters cannot self-approve. Grants are bound to one action and expire after use.
      </p>
    </Card>
  );
}
