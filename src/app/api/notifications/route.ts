import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/authz";
import { decryptMessage } from "@/lib/crypto";

const PAGE_SIZE = 30;
const PREVIEW_LENGTH = 80;

// GET /api/notifications — the current user's notifications, newest first.
// Without ?before, returns the newest PAGE_SIZE. Pass ?before=<id> to load
// the PAGE_SIZE notifications immediately older than that one — same cursor
// pattern used for message/thread pagination.
//
// No preview text is stored on the Notification row (message bodies are
// encrypted at rest — see prisma/schema.prisma's comment on the model), so
// it's decrypted fresh from the referenced Message here, same as every
// other message-listing route already does.
export async function GET(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const beforeId = new URL(request.url).searchParams.get("before");

  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE + 1, // one extra to detect hasMore
      ...(beforeId ? { cursor: { id: beforeId }, skip: 1 } : {}),
      select: {
        id: true,
        type: true,
        channelId: true,
        messageId: true,
        parentId: true,
        createdAt: true,
        readAt: true,
        actor: { select: { name: true, email: true } },
        channel: { select: { name: true, isDm: true } },
        message: { select: { body: true, deletedAt: true } },
      },
    }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);

  const hasMore = rows.length > PAGE_SIZE;
  if (hasMore) rows.length = PAGE_SIZE;

  const notifications = rows.map(({ actor, channel, message, ...n }) => ({
    ...n,
    actorName: actor.name ?? actor.email,
    channelName: channel.name,
    isDm: channel.isDm,
    preview: message.deletedAt ? "" : decryptMessage(message.body).slice(0, PREVIEW_LENGTH),
  }));

  return NextResponse.json({
    notifications,
    unreadCount,
    hasMore,
    nextCursor: hasMore ? notifications[notifications.length - 1].id : null,
  });
}
