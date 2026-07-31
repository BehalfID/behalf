import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const WEBAUTHN_CHALLENGE_KINDS = ["registration", "authentication"] as const;
export type WebAuthnChallengeKind = (typeof WEBAUTHN_CHALLENGE_KINDS)[number];

/** Short-lived, single-use WebAuthn ceremony challenges. */
const WebAuthnChallengeSchema = new Schema(
  {
    challengeId: { type: String, required: true, unique: true, index: true },
    /** SHA-256 of the challenge bytes — never store the raw challenge long-term after consume. */
    challengeHash: { type: String, required: true, unique: true },
    kind: { type: String, required: true, enum: WEBAUTHN_CHALLENGE_KINDS },
    /** Required for registration; optional for usernameless authentication. */
    userId: { type: String, default: null, index: true },
    consumedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true, index: true }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// TTL cleanup of expired challenges (Mongo).
WebAuthnChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type WebAuthnChallengeDocument = InferSchemaType<typeof WebAuthnChallengeSchema> & {
  _id: mongoose.Types.ObjectId;
};

const WebAuthnChallenge =
  (mongoose.models.WebAuthnChallenge as Model<WebAuthnChallengeDocument> | undefined) ??
  mongoose.model<WebAuthnChallengeDocument>("WebAuthnChallenge", WebAuthnChallengeSchema);

export default WebAuthnChallenge;
