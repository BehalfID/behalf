import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const InventoryServerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    wrapStatus: {
      type: String,
      enum: ["wrapped", "wrappable", "url-only", "advisory-behalfid", "unknown"],
      required: true,
    },
    command: { type: String, trim: true, maxlength: 500 },
    url: { type: String, trim: true, maxlength: 500 },
    catalogId: { type: String, trim: true, maxlength: 64 },
    downstreamCommand: { type: String, trim: true, maxlength: 500 },
  },
  { _id: false }
);

const FindingSchema = new Schema(
  {
    id: { type: String, required: true },
    ruleId: { type: String, required: true },
    category: { type: String, required: true },
    severity: { type: String, required: true },
    title: { type: String, required: true, maxlength: 300 },
    description: { type: String, required: true, maxlength: 2000 },
    evidence: { type: [String], default: [] },
    serverName: { type: String, maxlength: 120 },
    toolName: { type: String, maxlength: 120 },
    remediation: { type: String, maxlength: 2000 },
    action: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const McpEcosystemSnapshotSchema = new Schema(
  {
    snapshotId: { type: String, required: true, unique: true, index: true },
    accountId: { type: String, required: true, unique: true, index: true },
    sourcePath: { type: String, trim: true, maxlength: 500 },
    syncSource: {
      type: String,
      enum: ["cli", "dashboard"],
      required: true,
    },
    securityScore: { type: Number, min: 0, max: 100 },
    inventory: {
      sourcePath: { type: String, maxlength: 500 },
      servers: { type: [InventoryServerSchema], default: [] },
      wrappedCount: { type: Number, default: 0 },
      wrappableCount: { type: Number, default: 0 },
      urlOnlyCount: { type: Number, default: 0 },
      hasAdvisoryBehalfid: { type: Boolean, default: false },
    },
    reportSummary: { type: Schema.Types.Mixed },
    findings: { type: [FindingSchema], default: [] },
  },
  { timestamps: true }
);

export type McpEcosystemSnapshotDocument = InferSchemaType<typeof McpEcosystemSnapshotSchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
};

const McpEcosystemSnapshot =
  (mongoose.models.McpEcosystemSnapshot as Model<McpEcosystemSnapshotDocument> | undefined) ??
  mongoose.model<McpEcosystemSnapshotDocument>("McpEcosystemSnapshot", McpEcosystemSnapshotSchema);

export default McpEcosystemSnapshot;
