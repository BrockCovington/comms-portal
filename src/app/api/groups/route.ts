import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/authz";
import { getGroupsForList } from "@/lib/groups";

// GET /api/groups — all user groups (handle, name, member count). Readable by
// any signed-in user; drives the composer autocomplete + mention highlighting.
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ groups: await getGroupsForList() });
}
