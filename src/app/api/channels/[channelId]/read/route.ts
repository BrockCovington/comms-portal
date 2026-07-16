import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId, checkChannelAccess } from "@/lib/authz";
import { pusherServer, pusherChannelName } from "@/lib/pusher";

type RouteContext = { params: Promise<{ channelId: string }> };

// POST /api/channels/:channelId/read — mark this channel as read up to now.
export async function POST(_request: Request, { params }: RouteContext) {
  const { channelId } = await params;
  const userId = await getCurrentUserId();

  const access = await checkChannelAccess(userId, channelId);
  if (!access.ok) {
    return NextResponse.json({ error: "No access" }, { status: access.status });
  }

  // Explicit timestamp so the value we persist and the one we broadcast for
  // read receipts are identical.
  const readAt = new Date();
  await prisma.channelRead.upsert({
    where: { channelId_userId: { channelId, userId: userId! } },
    create: { channelId, userId: userId!, lastReadAt: readAt },
    update: { lastReadAt: readAt },
  });

  // Read receipts: let the other side of a DM know we've caught up, so their
  // "Seen" indicator updates live. Scoped to DMs — that's the only place
  // receipts are shown, and broadcasting on every read in a busy multi-person
  // channel would be needless chatter. The sender ignores their own event.
  if (access.channel.isDm) {
    await pusherServer
      .trigger(pusherChannelName(channelId), "read-receipt", {
        userId: userId!,
        readAt: readAt.toISOString(),
      })
      .catch(() => {
        // Best-effort — a missed receipt just means "Seen" lags until the
        // next read, never a broken channel.
      });
  }

  return NextResponse.json({ ok: true });
}
