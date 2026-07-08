import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId, checkChannelAccess } from "@/lib/authz";

type RouteContext = { params: Promise<{ channelId: string }> };

// POST /api/channels/:channelId/join — self-join a public channel. Private
// channels aren't self-joinable (they're invite-only, added via
// .../members instead); DMs don't apply.
export async function POST(_request: Request, { params }: RouteContext) {
  const { channelId } = await params;
  const userId = await getCurrentUserId();

  const access = await checkChannelAccess(userId, channelId);
  if (!access.ok) {
    return NextResponse.json({ error: "No access" }, { status: access.status });
  }
  if (access.channel.isPrivate || access.channel.isDm) {
    return NextResponse.json({ error: "This channel requires an invite" }, { status: 400 });
  }
  if (access.channel.archivedAt) {
    return NextResponse.json({ error: "This channel is archived" }, { status: 400 });
  }

  await prisma.channelMember.upsert({
    where: { channelId_userId: { channelId, userId: userId! } },
    update: {},
    create: { channelId, userId: userId! },
  });

  return NextResponse.json({ ok: true });
}
