import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const AUTH_EVENT_SURFACES = [
  "developer_login",
  "console_login",
  "api_key",
  "developer_token",
  "mfa"
] as const;
export type AuthEventSurface = (typeof AUTH_EVENT_SURFACES)[number];

export const AUTH_EVENT_REASONS = [
  "invalid_credentials",
  "unknown_account",
  "google_only_account",
  "sso_password_blocked",
  "invalid_api_key",
  "invalid_mfa",
  "mfa_required",
  "rate_limited"
] as const;
export type AuthEventReason = (typeof AUTH_EVENT_REASONS)[number];

const AuthEventSchema = new Schema(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    surface: { type: String, required: true, enum: AUTH_EVENT_SURFACES, index: true },
    outcome: { type: String, required: true, enum: ["failure", "success"], default: "failure", index: true },
    reason: { type: String, required: true, enum: AUTH_EVENT_REASONS },
    /** Truncated / hashed client IP for security correlation — not sold or used for ads. */
    ipHash: { type: String, required: true, index: true },
    /** Optional non-secret email domain or key prefix hint (never full secrets). */
    identityHint: { type: String, trim: true, maxlength: 120 },
    expiresAt: { type: Date, required: true, index: true }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AuthEventSchema.index({ createdAt: -1 });
AuthEventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type AuthEventDocument = InferSchemaType<typeof AuthEventSchema> & {
  _id: mongoose.Types.ObjectId;
};

const AuthEvent =
  (mongoose.models.AuthEvent as Model<AuthEventDocument> | undefined) ??
  mongoose.model<AuthEventDocument>("AuthEvent", AuthEventSchema);

export default AuthEvent;
