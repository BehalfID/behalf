import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const AccountSchema = new Schema(
  {
    accountId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 }
  },
  { timestamps: true }
);

export type AccountDocument = InferSchemaType<typeof AccountSchema> & {
  _id: mongoose.Types.ObjectId;
};

const Account =
  (mongoose.models.Account as Model<AccountDocument> | undefined) ??
  mongoose.model<AccountDocument>("Account", AccountSchema);

export default Account;
