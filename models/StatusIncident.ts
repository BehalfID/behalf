import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const IncidentUpdateSchema = new Schema(
  {
    body: { type: String, required: true, trim: true, maxlength: 2000 },
    status: {
      type: String,
      enum: ["investigating", "identified", "watching", "fixed"],
      required: true
    },
    createdAt: { type: Date, default: () => new Date() }
  },
  { _id: true }
);

const StatusIncidentSchema = new Schema(
  {
    incidentId: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    message: { type: String, trim: true, maxlength: 2000 },
    status: {
      type: String,
      enum: ["investigating", "identified", "watching", "fixed"],
      default: "investigating",
      index: true
    },
    severity: {
      type: String,
      enum: ["minor", "major", "critical"],
      default: "minor",
      index: true
    },
    componentIds: [{ type: String }],
    updates: { type: [IncidentUpdateSchema], default: [] },
    resolvedAt: { type: Date }
  },
  { timestamps: true }
);

export type IncidentUpdateDocument = InferSchemaType<typeof IncidentUpdateSchema> & {
  _id: mongoose.Types.ObjectId;
};

export type StatusIncidentDocument = InferSchemaType<typeof StatusIncidentSchema> & {
  _id: mongoose.Types.ObjectId;
};

const StatusIncident =
  (mongoose.models.StatusIncident as Model<StatusIncidentDocument> | undefined) ??
  mongoose.model<StatusIncidentDocument>("StatusIncident", StatusIncidentSchema);

export default StatusIncident;
