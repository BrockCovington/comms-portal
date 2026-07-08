import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId, checkChannelAccess } from "@/lib/authz";

type RouteContext = { params: Promise<{ channelId: string; messageId: string }> };

// POST /api/channels/:channelId/messages/:messageId/save — toggle "Later"
// flag. Anyone who can see the message can save it (unlike edit/delete,
// which are author-only) — same access shape as reactions.
export async function POST(_request: Request, { params }: RouteContext) {
  const { channelId, messageId } = await params;
  const userId = await getCurrentUserId();

  const access = await checkChannelAccess(userId, channelId);
  if (!access.ok) {
    return NextResponse.json({ error: "No access" }, { status: access.status });
  }

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { channelId: true },
  });
  if (!message || message.channelId !== channelId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const existing = await prisma.savedMessage.findUnique({
    where: { messageId_userId: { messageId, userId: userId! } },
    select: { id: true },
  });

  if (existing) {
    await prisma.savedMessage.delete({ where: { id: existing.id } });
    return NextResponse.json({ saved: false });
  }

  await prisma.savedMessage.create({ data: { messageId, userId: userId! } });
  return NextResponse.json({ saved: true });
}
