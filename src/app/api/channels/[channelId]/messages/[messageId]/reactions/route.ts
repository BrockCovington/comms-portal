import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId, checkChannelAccess } from "@/lib/authz";
import { toggleReactionSchema } from "@/lib/validation";
import { pusherServer, pusherChannelName } from "@/lib/pusher";

type RouteContext = { params: Promise<{ channelId: string; messageId: string }> };

// POST /api/channels/:channelId/messages/:messageId/reactions — toggle a
// reaction. The unique (messageId, userId, emoji) triple is the existence
// check: if it's there, remove it; if not, add it.
export async function POST(request: Request, { params }: RouteContext) {
  const { channelId, messageId } = await params;
  const userId = await getCurrentUserId();

  const access = await checkChannelAccess(userId, channelId);
  if (!access.ok) {
    return NextResponse.json({ error: "No access" }, { status: access.status });
  }

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { channelId: true, parentId: true },
  });
  if (!message || message.channelId !== channelId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = toggleReactionSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { emoji } = parsed.data;

  const existing = await prisma.reaction.findUnique({
    where: { messageId_userId_emoji: { messageId, userId: userId!, emoji } },
    select: { id: true },
  });

  const action = existing ? "remove" : "add";
  if (existing) {
    await prisma.reaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.reaction.create({ data: { messageId, userId: userId!, emoji } });
  }

  // The reactor's display name rides along so every viewer's "who reacted"
  // tooltip stays current without a re-fetch.
  const actor = await prisma.user.findUnique({ where: { id: userId! }, select: { name: true, email: true } });

  try {
    await pusherServer.trigger(pusherChannelName(channelId), "reaction-updated", {
      messageId,
      parentId: message.parentId,
      emoji,
      userId,
      action,
      name: actor?.name ?? actor?.email ?? "Someone",
    });
  } catch (err) {
    console.error("Pusher broadcast failed:", err);
  }

  return NextResponse.json({ action, emoji });
}
