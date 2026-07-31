import { NextResponse, type NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { deleteByTokenId } from "@/lib/repositories/apiTokens";
import { jsonError } from "@/lib/responses";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tokenId: string }> }
) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const { tokenId } = await params;

  const result = await deleteByTokenId(tokenId, auth.user.userId);

  if (result.deletedCount === 0) {
    return jsonError("Token not found.", 404);
  }

  return new NextResponse(null, { status: 204 });
}
