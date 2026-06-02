import { type NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { createPublicId } from "@/lib/ids";
import { isRecord, readString, rejectUnknownFields } from "@/lib/validation";
import { jsonError } from "@/lib/responses";
import EnterpriseInquiry from "@/models/EnterpriseInquiry";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  if (!isRecord(body)) return jsonError("Request body must be a JSON object.", 400);

  const unknownField = rejectUnknownFields(body, ["name", "email", "company", "message"]);
  if (unknownField) return jsonError(unknownField, 400);

  const name = readString(body.name);
  const email = readString(body.email);
  const company = readString(body.company);
  const message = readString(body.message);

  if (!name) return jsonError("name is required.", 400);
  if (name.length > 200) return jsonError("name must be 200 characters or fewer.", 400);
  if (!email) return jsonError("email is required.", 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonError("email must be a valid email address.", 400);
  if (email.length > 320) return jsonError("email must be 320 characters or fewer.", 400);
  if (!company) return jsonError("company is required.", 400);
  if (company.length > 200) return jsonError("company must be 200 characters or fewer.", 400);
  if (message.length > 2000) return jsonError("message must be 2000 characters or fewer.", 400);

  await connectToDatabase();

  const inquiryId = createPublicId("enq");
  await EnterpriseInquiry.create({ inquiryId, name, email, company, message });

  return NextResponse.json({ ok: true }, { status: 201 });
}
