import DeviceCode from "@/models/DeviceCode";
import { translateDuplicateKey } from "@/lib/repositories/errors";

export type DeviceCodeStatus = "pending" | "authorized" | "denied";

export type DeviceCodeLean = {
  _id?: unknown;
  codeId: string;
  deviceCode: string;
  userCode: string;
  status: DeviceCodeStatus;
  userId?: string | null;
  sessionToken?: string | null;
  expiresAt: Date;
  createdAt?: Date;
};

export type CreateDeviceCodeInput = Pick<
  DeviceCodeLean,
  "codeId" | "deviceCode" | "userCode" | "expiresAt"
> & {
  status?: DeviceCodeStatus;
  userId?: string | null;
  sessionToken?: string | null;
};

export async function createDeviceCode(input: CreateDeviceCodeInput): Promise<DeviceCodeLean> {
  try {
    const record = await DeviceCode.create(input);
    return record.toObject() as DeviceCodeLean;
  } catch (error) {
    translateDuplicateKey(error, "A device authorization code already exists.");
  }
}

export async function findByDeviceCode(deviceCode: string): Promise<DeviceCodeLean | null> {
  return (await DeviceCode.findOne({ deviceCode }).lean()) as DeviceCodeLean | null;
}

export async function findByUserCode(
  userCode: string,
  status?: DeviceCodeStatus
): Promise<DeviceCodeLean | null> {
  return (await DeviceCode.findOne({ userCode, ...(status ? { status } : {}) }).lean()) as DeviceCodeLean | null;
}

/** Atomically consume an authorized device code so concurrent polls cannot both succeed. */
export async function findOneAndDeleteAuthorized(deviceCode: string): Promise<DeviceCodeLean | null> {
  return (await DeviceCode.findOneAndDelete({ deviceCode, status: "authorized" }).lean()) as DeviceCodeLean | null;
}

export function updateStatus(
  userCode: string,
  status: DeviceCodeStatus,
  options?: { userId?: string | null; sessionToken?: string | null; expectedStatus?: DeviceCodeStatus }
) {
  const set: Record<string, unknown> = { status };
  if (options && "userId" in options) set.userId = options.userId;
  if (options && "sessionToken" in options) set.sessionToken = options.sessionToken;
  return DeviceCode.updateOne(
    { userCode, ...(options?.expectedStatus ? { status: options.expectedStatus } : {}) },
    { $set: set }
  );
}

export function deleteExpired(before = new Date()) {
  return DeviceCode.deleteMany({ expiresAt: { $lte: before } });
}

/** Mongo query primitives for routes that need an exact model query shape. */
export function findOneDeviceCode(filter: Record<string, unknown>) {
  return DeviceCode.findOne(filter);
}

export function createDeviceCodeDocument(input: Record<string, unknown>) {
  return DeviceCode.create(input);
}

export function deleteDeviceCode(filter: Record<string, unknown>) {
  return DeviceCode.findOneAndDelete(filter);
}

export const deviceCodeRepository = {
  create: createDeviceCodeDocument,
  findOne: findOneDeviceCode,
  findOneAndDelete: deleteDeviceCode
};

export interface DeviceCodesRepository {
  createDeviceCode: typeof createDeviceCode;
  findByDeviceCode: typeof findByDeviceCode;
  findByUserCode: typeof findByUserCode;
  findOneAndDeleteAuthorized: typeof findOneAndDeleteAuthorized;
  updateStatus: typeof updateStatus;
  deleteExpired: typeof deleteExpired;
}
