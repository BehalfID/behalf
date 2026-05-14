import { NextResponse, type NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { jsonError } from "@/lib/responses";
import DeveloperApiToken from "@/models/DeveloperApiToken";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tokenId: string }> }
) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const { tokenId } = await params;

  await connectToDatabase();

  const result = await DeveloperApiToken.deleteOne({
    tokenId,
    userId: auth.user.userId
  });

  if (result.deletedCount === 0) {
    return jsonError("Token not found.", 404);
  }

  return new NextResponse(null, { status: 204 });
}
