import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId, checkChannelAccess } from "@/lib/authz";
import { pusherServer, pusherChannelName } from "@/lib/pusher";

type RouteContext = { params: Promise<{ channelId: string; messageId: string }> };

// POST /api/channels/:channelId/messages/:messageId/pin — toggle a channel
// pin. Any member can pin/unpin (Slack-style, not author- or admin-only) —
// same access shape as reactions/save. Unlike "save for later" (personal),
// a pin is shared, so the change is broadcast to everyone in the channel.
export async function POST(_request: Request, { params }: RouteContext) {
  const { channelId, messageId } = await params;
  const userId = await getCurrentUserId();

  const access = await checkChannelAccess(userId, channelId);
  if (!access.ok) {
    return NextResponse.json({ error: "No access" }, { status: access.status });
  }

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { channelId: true, deletedAt: true },
  });
  if (!message || message.channelId !== channelId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (message.deletedAt) {
    return NextResponse.json({ error: "Can't pin a deleted message" }, { status: 400 });
  }

  const existing = await prisma.pinnedMessage.findUnique({
    where: { messageId },
    select: { id: true },
  });

  const pinned = !existing;
  if (existing) {
    await prisma.pinnedMessage.delete({ where: { id: existing.id } });
  } else {
    await prisma.pinnedMessage.create({ data: { messageId, channelId, pinnedById: userId! } });
  }

  try {
    await pusherServer.trigger(pusherChannelName(channelId), "pin-updated", { messageId, pinned });
  } catch (err) {
    console.error("Pin broadcast failed:", err);
  }

  return NextResponse.json({ pinned });
}
