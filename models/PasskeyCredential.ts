import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * A WebAuthn/passkey public-key credential bound to a human DeveloperUser.
 *
 * Deliberately separate from ExternalIdentity: passkeys are authenticator
 * credentials, not OIDC subjects. The authenticator's private key never leaves
 * the device/provider; we store only verification material.
 */
const PasskeyCredentialSchema = new Schema(
  {
    credentialRecordId: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    /** Base64url credential ID from the authenticator. */
    credentialId: { type: String, required: true, unique: true },
    /** Base64url-encoded COSE public key. */
    publicKey: { type: String, required: true },
    /** WebAuthn signature counter; detect cloned authenticators on rollback. */
    signCount: { type: Number, required: true, default: 0 },
    /** Hint transports from registration (usb, nfc, ble, internal, hybrid). */
    transports: { type: [String], default: undefined },
    /** User-assigned display name. Authoritative over browser-derived labels. */
    nickname: { type: String, required: true, trim: true, maxlength: 80 },
    /** WebAuthn userHandle used at registration (base64url of userId bytes). */
    userHandle: { type: String, required: true },
    /** deviceType from SimpleWebAuthn verification (singleDevice | multiDevice). */
    deviceType: { type: String, trim: true, maxlength: 40, default: null },
    backedUp: { type: Boolean, default: false },
    aaguid: { type: String, trim: true, maxlength: 64, default: null },
    lastUsedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

PasskeyCredentialSchema.index({ userId: 1, createdAt: -1 });

export type PasskeyCredentialDocument = InferSchemaType<typeof PasskeyCredentialSchema> & {
  _id: mongoose.Types.ObjectId;
};

const PasskeyCredential =
  (mongoose.models.PasskeyCredential as Model<PasskeyCredentialDocument> | undefined) ??
  mongoose.model<PasskeyCredentialDocument>("PasskeyCredential", PasskeyCredentialSchema);

export default PasskeyCredential;
