import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/authz";
import { getThreadsForUser } from "@/lib/threads";

// GET /api/threads — every thread the current user is involved in
// (started, or replied to) across all their channels, newest activity first.
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const threads = await getThreadsForUser(userId);
  return NextResponse.json({ threads });
}
