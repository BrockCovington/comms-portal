import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/authz";

// GET /api/channels/browse — every public channel workspace-wide, joined or
// not. Private channels aren't discoverable here by definition (invite-only).
// Archived channels are excluded too — they're frozen, not joinable.
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const channels = await prisma.channel.findMany({
    where: { isPrivate: false, isDm: false, archivedAt: null },
    select: {
      id: true,
      name: true,
      description: true,
      _count: { select: { members: true } },
      members: { where: { userId }, select: { userId: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    channels: channels.map(({ _count, members, ...c }) => ({
      ...c,
      memberCount: _count.members,
      joined: members.length > 0,
    })),
  });
}
