import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId, checkChannelAccess } from "@/lib/authz";

type RouteContext = { params: Promise<{ channelId: string; messageId: string }> };

// POST /api/channels/:channelId/messages/:messageId/read — mark the thread
// rooted at :messageId as read up to now.
export async function POST(_request: Request, { params }: RouteContext) {
  const { channelId, messageId } = await params;
  const userId = await getCurrentUserId();

  const access = await checkChannelAccess(userId, channelId);
  if (!access.ok) {
    return NextResponse.json({ error: "No access" }, { status: access.status });
  }

  const parent = await prisma.message.findUnique({
    where: { id: messageId },
    select: { channelId: true, parentId: true },
  });
  if (!parent || parent.channelId !== channelId || parent.parentId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.threadRead.upsert({
    where: { parentId_userId: { parentId: messageId, userId: userId! } },
    create: { parentId: messageId, userId: userId! },
    update: { lastReadAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
