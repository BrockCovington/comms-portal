import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId, checkChannelAccess } from "@/lib/authz";

type RouteContext = { params: Promise<{ channelId: string }> };

// POST /api/channels/:channelId/read — mark this channel as read up to now.
export async function POST(_request: Request, { params }: RouteContext) {
  const { channelId } = await params;
  const userId = await getCurrentUserId();

  const access = await checkChannelAccess(userId, channelId);
  if (!access.ok) {
    return NextResponse.json({ error: "No access" }, { status: access.status });
  }

  await prisma.channelRead.upsert({
    where: { channelId_userId: { channelId, userId: userId! } },
    create: { channelId, userId: userId! },
    update: { lastReadAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
