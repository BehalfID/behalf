import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const OAuthPendingSignupSchema = new Schema(
  {
    pendingId: { type: String, required: true, unique: true, index: true },
    googleSub: { type: String, required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    emailVerified: { type: Boolean, required: true },
    firstName: { type: String, trim: true, maxlength: 80 },
    lastName: { type: String, trim: true, maxlength: 80 },
    /** SHA-256 hash of the one-time completion token stored in the cookie. */
    tokenHash: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

OAuthPendingSignupSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type OAuthPendingSignupDocument = InferSchemaType<typeof OAuthPendingSignupSchema> & {
  _id: mongoose.Types.ObjectId;
};

const OAuthPendingSignup =
  (mongoose.models.OAuthPendingSignup as Model<OAuthPendingSignupDocument> | undefined) ??
  mongoose.model<OAuthPendingSignupDocument>("OAuthPendingSignup", OAuthPendingSignupSchema);

export default OAuthPendingSignup;
