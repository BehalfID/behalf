/** Public repository facade — dispatches via BEHALFID_REPOSITORY_BACKEND. */
import * as mongo from "@/lib/repositories/mongo/enterpriseInquiries";
import { delegate } from "@/lib/repositories/delegate";

export type {
  EnterpriseInquiryLean,
  CreateEnterpriseInquiryInput,
} from "@/lib/repositories/mongo/enterpriseInquiries";

export {
  enterpriseInquiryRepository,
} from "@/lib/repositories/mongo/enterpriseInquiries";

export const createEnterpriseInquiry = delegate("enterpriseInquiries", "createEnterpriseInquiry", mongo.createEnterpriseInquiry);
export const listEnterpriseInquiries = delegate("enterpriseInquiries", "listEnterpriseInquiries", mongo.listEnterpriseInquiries);
export const findEnterpriseInquiry = delegate("enterpriseInquiries", "findEnterpriseInquiry", mongo.findEnterpriseInquiry);
export const updateEnterpriseInquiry = delegate("enterpriseInquiries", "updateEnterpriseInquiry", mongo.updateEnterpriseInquiry);
export const findEnterpriseInquiries = delegate("enterpriseInquiries", "findEnterpriseInquiries", mongo.findEnterpriseInquiries);
export const findOneAndUpdateEnterpriseInquiry = delegate("enterpriseInquiries", "findOneAndUpdateEnterpriseInquiry", mongo.findOneAndUpdateEnterpriseInquiry);
