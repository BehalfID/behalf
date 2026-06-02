import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const EnterpriseInquirySchema = new Schema(
  {
    inquiryId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 320 },
    company: { type: String, required: true, trim: true, maxlength: 200 },
    message: { type: String, trim: true, maxlength: 2000, default: "" },
    status: { type: String, enum: ["new", "reviewed"], default: "new", required: true, index: true }
  },
  { timestamps: true }
);

export type EnterpriseInquiryDocument = InferSchemaType<typeof EnterpriseInquirySchema> & {
  _id: mongoose.Types.ObjectId;
};

const EnterpriseInquiry =
  (mongoose.models.EnterpriseInquiry as Model<EnterpriseInquiryDocument> | undefined) ??
  mongoose.model<EnterpriseInquiryDocument>("EnterpriseInquiry", EnterpriseInquirySchema);

export default EnterpriseInquiry;
