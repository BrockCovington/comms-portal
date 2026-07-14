import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId, checkChannelAccess } from "@/lib/authz";
import { decryptMessage } from "@/lib/crypto";

type RouteContext = { params: Promise<{ channelId: string }> };

const PREVIEW_LENGTH = 200;

// GET /api/channels/:channelId/pins — the channel's pinned messages, newest
// pin first, for the header panel. Bodies are decrypted at read time (same
// as every other message-listing route). A pin whose message was since
// deleted is skipped.
export async function GET(_request: Request, { params }: RouteContext) {
  const { channelId } = await params;
  const userId = await getCurrentUserId();

  const access = await checkChannelAccess(userId, channelId);
  if (!access.ok) {
    return NextResponse.json({ error: "No access" }, { status: access.status });
  }

  const pins = await prisma.pinnedMessage.findMany({
    where: { channelId },
    orderBy: { createdAt: "desc" },
    select: {
      createdAt: true,
      pinnedBy: { select: { name: true } },
      message: {
        select: {
          id: true,
          body: true,
          deletedAt: true,
          parentId: true,
          createdAt: true,
          user: { select: { name: true } },
        },
      },
    },
  });

  const pinnedMessages = pins
    .filter((p) => !p.message.deletedAt)
    .map((p) => ({
      messageId: p.message.id,
      parentId: p.message.parentId,
      preview: decryptMessage(p.message.body).slice(0, PREVIEW_LENGTH),
      authorName: p.message.user.name,
      createdAt: p.message.createdAt,
      pinnedByName: p.pinnedBy.name,
    }));

  return NextResponse.json({ pins: pinnedMessages });
}
