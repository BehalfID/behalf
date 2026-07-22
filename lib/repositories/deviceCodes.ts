/** Public repository facade — dispatches via BEHALFID_REPOSITORY_BACKEND. */
import * as mongo from "@/lib/repositories/mongo/deviceCodes";
import { delegate } from "@/lib/repositories/delegate";

export type {
  DeviceCodeStatus,
  DeviceCodeLean,
  CreateDeviceCodeInput,
  DeviceCodesRepository,
} from "@/lib/repositories/mongo/deviceCodes";

export {
  deviceCodeRepository,
} from "@/lib/repositories/mongo/deviceCodes";

export const createDeviceCode = delegate("deviceCodes", "createDeviceCode", mongo.createDeviceCode);
export const findByDeviceCode = delegate("deviceCodes", "findByDeviceCode", mongo.findByDeviceCode);
export const findByUserCode = delegate("deviceCodes", "findByUserCode", mongo.findByUserCode);
export const findOneAndDeleteAuthorized = delegate("deviceCodes", "findOneAndDeleteAuthorized", mongo.findOneAndDeleteAuthorized);
export const updateStatus = delegate("deviceCodes", "updateStatus", mongo.updateStatus);
export const deleteExpired = delegate("deviceCodes", "deleteExpired", mongo.deleteExpired);
export const findOneDeviceCode = delegate("deviceCodes", "findOneDeviceCode", mongo.findOneDeviceCode);
export const createDeviceCodeDocument = delegate("deviceCodes", "createDeviceCodeDocument", mongo.createDeviceCodeDocument);
export const deleteDeviceCode = delegate("deviceCodes", "deleteDeviceCode", mongo.deleteDeviceCode);
