import CliPauseLease from "@/models/CliPauseLease";

export async function findActivePauseLeases(query: Record<string, unknown>, limit = 20) {
  return CliPauseLease.find(query).sort({ expiresAt: -1 }).limit(limit).lean();
}

export async function createPauseLease(input: Record<string, unknown>) {
  return CliPauseLease.create(input);
}
