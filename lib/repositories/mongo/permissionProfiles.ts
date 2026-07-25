import PermissionProfile, { type PermissionProfileDocument } from "@/models/PermissionProfile";

export type PermissionProfileLean = PermissionProfileDocument;

export async function listPermissionProfiles(accountId: string): Promise<PermissionProfileLean[]> {
  return PermissionProfile.find({ accountId, status: "active" })
    .sort({ createdAt: -1 })
    .select("-_id profileId name description permissions requiredAuthorityLevel createdBy createdAt updatedAt")
    .lean();
}

export async function findPermissionProfile(
  profileId: string,
  accountId: string
): Promise<PermissionProfileLean | null> {
  return PermissionProfile.findOne({ profileId, accountId }).lean();
}

export type ProfilePermissionEntry = {
  action: string;
  resource?: string | null;
  allowedActions?: string[];
  blockedActions?: string[];
  requiresApproval?: boolean | null;
  notes?: string | null;
  requiredAuthorityLevel: number;
};

export type CreatePermissionProfileInput = {
  profileId: string;
  accountId: string;
  name: string;
  description?: string;
  permissions: ProfilePermissionEntry[];
  requiredAuthorityLevel: number;
  createdBy: string;
  status: PermissionProfileDocument["status"];
};

export async function createPermissionProfile(input: CreatePermissionProfileInput) {
  return PermissionProfile.create(input);
}

export async function updatePermissionProfile(
  profileId: string,
  accountId: string,
  update: Partial<
    Pick<PermissionProfileDocument, "name" | "description" | "permissions" | "requiredAuthorityLevel" | "status">
  >
) {
  return PermissionProfile.findOneAndUpdate({ profileId, accountId }, { $set: update }, { new: true }).lean();
}
