import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/authz";
import { getChannelsWithUnread } from "@/lib/channels";

// GET /api/channels/mine — the channels & DMs the current user belongs to,
// as post targets (id + display name + isDm). Powers the forward-message
// target picker. Reuses the sidebar's membership query; archived channels
// are excluded (can't post to them).
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const channels = await getChannelsWithUnread(userId);
  return NextResponse.json({
    channels: channels
      .filter((c) => !c.archivedAt)
      .map((c) => ({ id: c.id, name: c.name, isDm: c.isDm })),
  });
}
