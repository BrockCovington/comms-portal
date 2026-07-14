import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId, checkChannelAccess } from "@/lib/authz";
import { decryptMessage } from "@/lib/crypto";

type RouteContext = { params: Promise<{ channelId: string; messageId: string }> };

// GET /api/channels/:channelId/messages/:messageId/history — the full edit
// history of a message: every prior version plus the current one, oldest
// first. Anyone who can read the channel can see it (same access as reading
// the message). Bodies are decrypted at read time, like every other
// message-listing route.
export async function GET(_request: Request, { params }: RouteContext) {
  const { channelId, messageId } = await params;
  const userId = await getCurrentUserId();

  const access = await checkChannelAccess(userId, channelId);
  if (!access.ok) {
    return NextResponse.json({ error: "No access" }, { status: access.status });
  }

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      channelId: true,
      body: true,
      createdAt: true,
      editedAt: true,
      deletedAt: true,
      revisions: { orderBy: { editedAt: "asc" }, select: { body: true, editedAt: true } },
    },
  });
  if (!message || message.channelId !== channelId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Prior versions (each with the time it was authored), then the current
  // one. The first entry is the original (its editedAt == the message's
  // createdAt, snapshotted on the first edit).
  const versions = [
    ...message.revisions.map((r) => ({
      body: decryptMessage(r.body),
      editedAt: r.editedAt,
      current: false,
    })),
    {
      body: message.deletedAt ? "" : decryptMessage(message.body),
      editedAt: message.editedAt ?? message.createdAt,
      current: true,
    },
  ];

  return NextResponse.json({ versions });
}
