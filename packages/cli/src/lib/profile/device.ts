import { randomBytes } from "node:crypto";
import { readExtendedConfig, writeExtendedConfig } from "../config.js";

export function getOrCreateDeviceId(): string {
  const config = readExtendedConfig();
  if (config.deviceId) return config.deviceId;
  const deviceId = `devmac_${randomBytes(8).toString("base64url")}`;
  writeExtendedConfig({ deviceId });
  return deviceId;
}
