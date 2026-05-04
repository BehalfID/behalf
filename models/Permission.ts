import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const PermissionSchema = new Schema(
  {
    permissionId: { type: String, required: true, unique: true, index: true },
    accountId: { type: String, index: true },
    developerUserId: { type: String, index: true },
    agentId: { type: String, required: true, index: true },
    action: { type: String, required: true, trim: true, maxlength: 80, index: true },
    description: { type: String, trim: true, maxlength: 240 },
    resource: { type: String, trim: true, maxlength: 240 },
    scope: { type: String, trim: true, maxlength: 500 },
    blockedActions: [{ type: String, trim: true, maxlength: 160 }],
    requiresApproval: { type: Boolean },
    notes: { type: String, trim: true, maxlength: 800 },
    template: {
      type: String,
      enum: ["access_data", "create_content", "schedule", "purchase", "custom"],
      index: true
    },
    constraints: {
      maxAmount: { type: Number, min: 0 },
      allowedVendors: [{ type: String, trim: true, maxlength: 200 }],
      expiresAt: { type: Date }
    },
    status: {
      type: String,
      enum: ["active", "revoked"],
      default: "active",
      index: true
    },
    lastUsedAt: { type: Date }
  },
  { timestamps: true }
);

PermissionSchema.index({ accountId: 1, agentId: 1, action: 1, status: 1 });
PermissionSchema.index({ developerUserId: 1, agentId: 1, action: 1, status: 1 });

export type PermissionDocument = InferSchemaType<typeof PermissionSchema> & {
  _id: mongoose.Types.ObjectId;
};

const Permission =
  (mongoose.models.Permission as Model<PermissionDocument> | undefined) ??
  mongoose.model<PermissionDocument>("Permission", PermissionSchema);

export default Permission;
