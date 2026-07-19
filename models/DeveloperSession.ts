import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const DeveloperSessionSchema = new Schema(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, required: true },
    /** Last authenticated activity; sessions expire after inactivity. */
    lastActivityAt: { type: Date, required: true, default: () => new Date() },
    /** Active workspace account for multi-account users. Must match an AccountMembership. */
    activeAccountId: { type: String, index: true, sparse: true }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

DeveloperSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type DeveloperSessionDocument = InferSchemaType<typeof DeveloperSessionSchema> & {
  _id: mongoose.Types.ObjectId;
};

const DeveloperSession =
  (mongoose.models.DeveloperSession as Model<DeveloperSessionDocument> | undefined) ??
  mongoose.model<DeveloperSessionDocument>("DeveloperSession", DeveloperSessionSchema);

export default DeveloperSession;
