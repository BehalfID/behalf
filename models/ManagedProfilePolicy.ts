import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const WorkHoursSchema = new Schema(
  {
    enabled: { type: Boolean, default: false },
    days: { type: [Number], default: [1, 2, 3, 4, 5] },
    start: { type: String, default: "09:00", trim: true, maxlength: 5 },
    end: { type: String, default: "17:00", trim: true, maxlength: 5 },
  },
  { _id: false }
);

const ProtectedRepoSchema = new Schema(
  {
    repoHash: { type: String, required: true, trim: true, maxlength: 64 },
    label: { type: String, trim: true, maxlength: 120 },
    mode: {
      type: String,
      enum: ["unmanaged", "managed", "required"],
      default: "required",
    },
    enabled: { type: Boolean, default: true },
  },
  { _id: false }
);

const PausePolicySchema = new Schema(
  {
    enabled: { type: Boolean, default: true },
    reasonRequired: { type: Boolean, default: true },
    maxDurationMinutes: { type: Number, default: 240, min: 1, max: 240 },
    allowAllRepos: { type: Boolean, default: false },
    requireApprovalForRequiredMode: { type: Boolean, default: false },
  },
  { _id: false }
);

const ManagedProfilePolicySchema = new Schema(
  {
    policyId: { type: String, required: true, unique: true, index: true },
    accountId: { type: String, required: true, unique: true, index: true },
    timezone: { type: String, default: "UTC", trim: true, maxlength: 64 },
    enabled: { type: Boolean, default: false },
    workHours: { type: WorkHoursSchema, default: () => ({}) },
    duringHoursMode: {
      type: String,
      enum: ["unmanaged", "managed", "required"],
      default: "managed",
    },
    outsideHoursMode: {
      type: String,
      enum: ["unmanaged", "managed", "required"],
      default: "unmanaged",
    },
    defaultMode: {
      type: String,
      enum: ["unmanaged", "managed", "required"],
      default: "unmanaged",
    },
    toolModes: {
      claude: { type: String, enum: ["unmanaged", "managed", "required"], default: undefined },
      codex: { type: String, enum: ["unmanaged", "managed", "required"], default: undefined },
      cursor: { type: String, enum: ["unmanaged", "managed", "required"], default: undefined },
    },
    protectedRepos: { type: [ProtectedRepoSchema], default: [] },
    pausePolicy: { type: PausePolicySchema, default: () => ({}) },
  },
  { timestamps: true }
);

export type ManagedProfilePolicyDocument = InferSchemaType<typeof ManagedProfilePolicySchema> & {
  _id: mongoose.Types.ObjectId;
};

const ManagedProfilePolicy =
  (mongoose.models.ManagedProfilePolicy as Model<ManagedProfilePolicyDocument> | undefined) ??
  mongoose.model<ManagedProfilePolicyDocument>("ManagedProfilePolicy", ManagedProfilePolicySchema);

export default ManagedProfilePolicy;
