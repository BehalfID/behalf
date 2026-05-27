import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const StatusComponentSchema = new Schema(
  {
    componentId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 500 },
    group: { type: String, trim: true, maxlength: 80, index: true },
    sortOrder: { type: Number, default: 0, index: true },
    status: {
      type: String,
      enum: ["operational", "performance_issues", "partial_outage", "major_outage"],
      default: "operational",
      index: true
    },
    enabled: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);

export type StatusComponentDocument = InferSchemaType<typeof StatusComponentSchema> & {
  _id: mongoose.Types.ObjectId;
};

const StatusComponent =
  (mongoose.models.StatusComponent as Model<StatusComponentDocument> | undefined) ??
  mongoose.model<StatusComponentDocument>("StatusComponent", StatusComponentSchema);

export default StatusComponent;
