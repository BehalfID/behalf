import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { EXTERNAL_IDENTITY_PROVIDERS } from "@/models/ExternalIdentity";

const OAuthPendingSignupSchema = new Schema(
  {
    pendingId: { type: String, required: true, unique: true, index: true },
    /** Legacy Google-only key. Still written for Google so pre-existing rows resolve unchanged. */
    googleSub: { type: String, required: false, index: true },
    provider: {
      type: String,
      required: true,
      enum: EXTERNAL_IDENTITY_PROVIDERS,
      default: "google"
    },
    /** Provider-neutral identity key. Mirrors googleSub for Google. */
    providerAccountId: { type: String, required: false },
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
OAuthPendingSignupSchema.index({ provider: 1, providerAccountId: 1 });

export type OAuthPendingSignupDocument = InferSchemaType<typeof OAuthPendingSignupSchema> & {
  _id: mongoose.Types.ObjectId;
};

const OAuthPendingSignup =
  (mongoose.models.OAuthPendingSignup as Model<OAuthPendingSignupDocument> | undefined) ??
  mongoose.model<OAuthPendingSignupDocument>("OAuthPendingSignup", OAuthPendingSignupSchema);

export default OAuthPendingSignup;
