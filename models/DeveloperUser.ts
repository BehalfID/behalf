import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const DeveloperUserSchema = new Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true, select: false },
    onboardingUseCase: {
      type: String,
      enum: ["personal", "website", "sdk"],
      default: "sdk",
      index: true
    },
    primaryAccountId: { type: String, index: true, sparse: true },
    /** ISO date string (YYYY-MM-DD). Stored server-side for COPPA compliance; never returned in public responses. */
    dateOfBirth: { type: String, select: false },
    /** Whether the user has verified their email address. Null/undefined = pre-verification-feature accounts, treated as verified. */
    emailVerified: { type: Boolean, select: true },
    /** SHA-256 hash of the pending email verification token. Never returned in API responses. */
    emailVerificationTokenHash: { type: String, select: false },
    emailVerificationTokenExpiresAt: { type: Date, select: false },
    /** SHA-256 hash of the short verification code (e.g. XXXX-XXXX). Never returned in API responses. */
    emailVerificationCodeHash: { type: String, select: false },
    /** SHA-256 hash of the pending password reset token. Never returned in API responses. */
    passwordResetTokenHash: { type: String, select: false },
    passwordResetTokenExpiresAt: { type: Date, select: false }
  },
  { timestamps: true }
);

export type DeveloperUserDocument = InferSchemaType<typeof DeveloperUserSchema> & {
  _id: mongoose.Types.ObjectId;
};

const DeveloperUser =
  (mongoose.models.DeveloperUser as Model<DeveloperUserDocument> | undefined) ??
  mongoose.model<DeveloperUserDocument>("DeveloperUser", DeveloperUserSchema);

export default DeveloperUser;
