import EnterpriseInquiry, { type EnterpriseInquiryDocument } from "@/models/EnterpriseInquiry";

export type EnterpriseInquiryLean = EnterpriseInquiryDocument;

export type CreateEnterpriseInquiryInput = {
  inquiryId: string;
  name: string;
  email: string;
  company: string;
  message: string;
  status?: EnterpriseInquiryDocument["status"];
};

export async function createEnterpriseInquiry(input: CreateEnterpriseInquiryInput) {
  return EnterpriseInquiry.create(input);
}

export async function listEnterpriseInquiries(): Promise<EnterpriseInquiryLean[]> {
  return EnterpriseInquiry.find().sort({ createdAt: -1 }).lean();
}

export async function findEnterpriseInquiry(inquiryId: string): Promise<EnterpriseInquiryLean | null> {
  return EnterpriseInquiry.findOne({ inquiryId }).lean();
}

export async function updateEnterpriseInquiry(
  inquiryId: string,
  update: Partial<Pick<EnterpriseInquiryDocument, "status" | "name" | "email" | "company" | "message">>
) {
  return EnterpriseInquiry.findOneAndUpdate({ inquiryId }, { $set: update }, { new: true }).lean();
}

export function findEnterpriseInquiries(filter: Record<string, unknown> = {}) {
  return EnterpriseInquiry.find(filter);
}

export function findOneAndUpdateEnterpriseInquiry(
  filter: Record<string, unknown>,
  update: Record<string, unknown>,
  options?: Record<string, unknown>
) {
  return EnterpriseInquiry.findOneAndUpdate(filter, update, options);
}

export const enterpriseInquiryRepository = { create: createEnterpriseInquiry, find: findEnterpriseInquiries, findOneAndUpdate: findOneAndUpdateEnterpriseInquiry };
