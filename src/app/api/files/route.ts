import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/authz";
import { getFilesForUser } from "@/lib/files";

// GET /api/files — recent files across every channel the current user can
// access. Each still only serves its actual bytes through the existing
// access-checked /api/files/[attachmentId] route — this is purely an index.
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const files = await getFilesForUser(userId);
  return NextResponse.json({ files });
}
