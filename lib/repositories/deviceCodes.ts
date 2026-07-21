import DeviceCode from "@/models/DeviceCode";

export async function createDeviceCode(input: {
  codeId: string;
  deviceCode: string;
  userCode: string;
  expiresAt: Date;
}) {
  return DeviceCode.create(input);
}

export async function findDeviceCodeByDeviceCode(deviceCode: string) {
  return DeviceCode.findOne({ deviceCode }).lean();
}

export async function findPendingDeviceCodeByUserCode(userCode: string) {
  return DeviceCode.findOne({ userCode, status: "pending" }).lean();
}

export async function claimAuthorizedDeviceCode(deviceCode: string) {
  return DeviceCode.findOneAndDelete({ deviceCode, status: "authorized" });
}

export async function authorizePendingDeviceCode(userCode: string, userId: string) {
  return DeviceCode.findOneAndUpdate(
    { userCode, status: "pending" },
    {
      $set: {
        status: "authorized",
        userId,
        sessionToken: null
      }
    },
    { returnDocument: "after" }
  );
}
