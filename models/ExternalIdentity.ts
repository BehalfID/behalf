import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * Login identity providers that can be linked to a human BehalfID account.
 *
 * Deliberately narrower than "every provider BehalfID talks to". Enterprise SSO
 * (workspace-enforced Google Workspace), repo installations, API tokens, and
 * agent identities are separate principal kinds and are not represented here.
 * See docs/AUTH_PROVIDERS.md.
 */
export const EXTERNAL_IDENTITY_PROVIDERS = ["github", "google"] as const;
export type ExternalIdentityProvider = (typeof EXTERNAL_IDENTITY_PROVIDERS)[number];

const ExternalIdentitySchema = new Schema(
  {
    identityId: { type: String, required: true, unique: true, index: true },
    /** DeveloperUser.userId that owns this identity. */
    userId: { type: String, required: true, index: true },
    provider: { type: String, required: true, enum: EXTERNAL_IDENTITY_PROVIDERS },
    /**
     * The provider's stable, immutable account identifier — GitHub's numeric
     * user ID, Google's `sub`. Never a username or email: those are mutable and
     * reassignable at the provider, so keying on them allows account takeover
     * after a rename or address release.
     */
    providerAccountId: { type: String, required: true },
    /** Display-only login handle captured at link time. Never used for lookup. */
    providerUsername: { type: String, trim: true, maxlength: 120, default: null },
    /** Email reported by the provider at link time. Informational only. */
    providerEmail: { type: String, lowercase: true, trim: true, maxlength: 254, default: null },
    /** Whether the provider asserted the email above was verified. */
    providerEmailVerified: { type: Boolean, default: false },
    linkedAt: { type: Date, default: () => new Date() },
    lastLoginAt: { type: Date, default: null }
  },
  { timestamps: true }
);

// One provider account maps to at most one BehalfID user. This constraint is
// what makes "reject sign-in when this identity belongs to another account" a
// storage guarantee rather than an application-code convention.
ExternalIdentitySchema.index({ provider: 1, providerAccountId: 1 }, { unique: true });
// A user holds at most one identity per provider, so link/unlink stays unambiguous.
ExternalIdentitySchema.index({ userId: 1, provider: 1 }, { unique: true });

export type ExternalIdentityDocument = InferSchemaType<typeof ExternalIdentitySchema> & {
  _id: mongoose.Types.ObjectId;
};

const ExternalIdentity =
  (mongoose.models.ExternalIdentity as Model<ExternalIdentityDocument> | undefined) ??
  mongoose.model<ExternalIdentityDocument>("ExternalIdentity", ExternalIdentitySchema);

export default ExternalIdentity;
