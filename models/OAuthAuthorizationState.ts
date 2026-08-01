import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { EXTERNAL_IDENTITY_PROVIDERS } from "@/models/ExternalIdentity";

export const OAUTH_FLOW_MODES = ["login", "signup", "link", "reauth"] as const;
export type OAuthFlowMode = (typeof OAUTH_FLOW_MODES)[number];

/**
 * Server-side record of one in-flight OAuth authorization request.
 *
 * Holding this server-side rather than packing everything into a signed `state`
 * string buys three properties the signed-cookie approach cannot:
 *   1. `state` is single-use — consumption is an atomic conditional update.
 *   2. The PKCE `code_verifier` never leaves the server, so it is not exposed
 *      to the browser, the provider, or referrer/proxy logs.
 *   3. Only the SHA-256 of the state secret is stored, so a database read does
 *      not yield replayable authorization states.
 */
const OAuthAuthorizationStateSchema = new Schema(
  {
    stateId: { type: String, required: true, unique: true, index: true },
    provider: { type: String, required: true, enum: EXTERNAL_IDENTITY_PROVIDERS },
    mode: { type: String, required: true, enum: OAUTH_FLOW_MODES },
    /** SHA-256 of the opaque state secret sent to the provider. */
    stateHash: { type: String, required: true, unique: true, index: true, select: false },
    /** PKCE verifier. Server-only: never sent to the client or the provider. */
    codeVerifier: { type: String, required: true, select: false },
    /** Safe same-origin relative path to return to after the flow completes. */
    next: { type: String, default: null, maxlength: 512 },
    /** Set for `link` mode: the already-authenticated user who started the flow. */
    userId: { type: String, default: null, index: true },
    /** Set once when the callback consumes this state; enforces single use. */
    consumedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

OAuthAuthorizationStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type OAuthAuthorizationStateDocument = InferSchemaType<
  typeof OAuthAuthorizationStateSchema
> & {
  _id: mongoose.Types.ObjectId;
};

const OAuthAuthorizationState =
  (mongoose.models.OAuthAuthorizationState as
    | Model<OAuthAuthorizationStateDocument>
    | undefined) ??
  mongoose.model<OAuthAuthorizationStateDocument>(
    "OAuthAuthorizationState",
    OAuthAuthorizationStateSchema
  );

export default OAuthAuthorizationState;
