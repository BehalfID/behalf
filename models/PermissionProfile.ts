import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const PermissionProfilePermissionSchema = new Schema(
  {
    action: { type: String, required: true, trim: true, maxlength: 80 },
    resource: { type: String, trim: true, maxlength: 240 },
    allowedActions: [{ type: String, trim: true, maxlength: 160 }],
    blockedActions: [{ type: String, trim: true, maxlength: 160 }],
    requiresApproval: { type: Boolean },
    notes: { type: String, trim: true, maxlength: 800 },
    requiredAuthorityLevel: { type: Number, min: 0, max: 100, required: true }
  },
  { _id: false }
);

const PermissionProfileSchema = new Schema(
  {
    profileId: { type: String, required: true, unique: true, index: true },
    accountId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 500 },
    permissions: { type: [PermissionProfilePermissionSchema], default: [] },
    requiredAuthorityLevel: { type: Number, min: 0, max: 100, required: true, index: true },
    createdBy: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ["active", "archived"],
      default: "active",
      index: true
    }
  },
  { timestamps: true }
);

PermissionProfileSchema.index({ accountId: 1, name: 1, status: 1 });

export type PermissionProfileDocument = InferSchemaType<typeof PermissionProfileSchema> & {
  _id: mongoose.Types.ObjectId;
};

const PermissionProfile =
  (mongoose.models.PermissionProfile as Model<PermissionProfileDocument> | undefined) ??
  mongoose.model<PermissionProfileDocument>("PermissionProfile", PermissionProfileSchema);

export default PermissionProfile;
