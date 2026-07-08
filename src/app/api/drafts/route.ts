import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/authz";
import { getDraftsForUser } from "@/lib/drafts";

// GET /api/drafts — every channel where the current user has an unsent draft.
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const drafts = await getDraftsForUser(userId);
  return NextResponse.json({ drafts });
}
