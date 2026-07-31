import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * Providers that can appear on identity audit rows.
 * Includes password and passkey so durable history covers every human login path.
 */
export const IDENTITY_AUDIT_PROVIDERS = ["github", "google", "password", "passkey"] as const;
export type IdentityAuditProvider = (typeof IDENTITY_AUDIT_PROVIDERS)[number];

export const IDENTITY_AUDIT_ACTIONS = [
  /** A provider identity was attached to an existing account from settings. */
  "identity_linked",
  /** A provider identity was detached from an account. */
  "identity_unlinked",
  /** A new account was registered through a provider. */
  "identity_registered",
  /** An existing account signed in through a linked provider identity. */
  "identity_login",
  /** A link attempt was refused because the identity belongs to another account. */
  "identity_link_rejected",
  /** Successful password authentication. */
  "password_login",
  /** Passkey registered on an authenticated account. */
  "passkey_registered",
  /** Passkey nickname changed. */
  "passkey_renamed",
  /** Passkey removed. */
  "passkey_removed",
  /** Removal refused because it was the last usable / recovery method. */
  "method_removal_rejected"
] as const;
export type IdentityAuditAction = (typeof IDENTITY_AUDIT_ACTIONS)[number];

/**
 * Durable, user-attributed record of identity lifecycle changes.
 *
 * Separate from AuthEvent on purpose. AuthEvent is short-lived (30-day TTL),
 * IP-hashed security telemetry with no subject, which is the right shape for
 * brute-force detection but the wrong shape for answering "who connected this
 * GitHub account to my workspace, and when". Account-security history has to
 * outlive the telemetry window and name its subject.
 */
const IdentityAuditLogSchema = new Schema(
  {
    entryId: { type: String, required: true, unique: true, index: true },
    /** Subject account the identity belongs to. */
    userId: { type: String, required: true, index: true },
    action: { type: String, required: true, enum: IDENTITY_AUDIT_ACTIONS, index: true },
    provider: { type: String, required: true, enum: IDENTITY_AUDIT_PROVIDERS },
    /**
     * Provider account key or passkey credentialRecordId. Safe to store: it is
     * an opaque public identifier, not a credential.
     */
    providerAccountId: { type: String, required: true, maxlength: 120 },
    providerUsername: { type: String, trim: true, maxlength: 120, default: null },
    /** SHA-256 truncated client IP, matching lib/authEvents.ts hashing. */
    ipHash: { type: String, default: null },
    /** Non-secret context (e.g. "settings", "callback"). Never tokens or emails. */
    context: { type: String, trim: true, maxlength: 60, default: null }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

IdentityAuditLogSchema.index({ userId: 1, createdAt: -1 });

export type IdentityAuditLogDocument = InferSchemaType<typeof IdentityAuditLogSchema> & {
  _id: mongoose.Types.ObjectId;
};

const IdentityAuditLog =
  (mongoose.models.IdentityAuditLog as Model<IdentityAuditLogDocument> | undefined) ??
  mongoose.model<IdentityAuditLogDocument>("IdentityAuditLog", IdentityAuditLogSchema);

export default IdentityAuditLog;
