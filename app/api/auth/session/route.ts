import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { checkSessionOnServer } from "@/lib/developerAuth";
import { noCacheJson } from "@/lib/responses";

export async function GET() {
  try {
    await connectToDatabase();
    const session = await checkSessionOnServer();

    if (!session) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    return noCacheJson({ authenticated: true, session });
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 500 });
  }
}
