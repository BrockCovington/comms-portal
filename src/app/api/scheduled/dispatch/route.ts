import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptMessage } from "@/lib/crypto";
import { deliverMessage } from "@/lib/deliver";

const BATCH = 200;

// POST /api/scheduled/dispatch — delivers every scheduled message whose time
// has come. Meant to be hit by a scheduler (external cron) every minute; see
// the deploy notes. Protected by CRON_SECRET: without a matching bearer
// token it refuses (fail closed — this endpoint sends messages as users).
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Dispatcher not configured (CRON_SECRET unset)" }, { status: 503 });
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const due = await prisma.scheduledMessage.findMany({
    where: { sendAt: { lte: now }, sentAt: null, canceledAt: null, failedAt: null },
    orderBy: { sendAt: "asc" },
    take: BATCH,
    select: {
      id: true,
      channelId: true,
      userId: true,
      body: true,
      parentId: true,
      attachmentIds: true,
      mentionedUserIds: true,
    },
  });

  let delivered = 0;
  let failed = 0;

  for (const sm of due) {
    // Claim the row so an overlapping dispatch run can't send it twice: only
    // the run whose update actually flips sentAt proceeds.
    const claim = await prisma.scheduledMessage.updateMany({
      where: { id: sm.id, sentAt: null, canceledAt: null, failedAt: null },
      data: { sentAt: now },
    });
    if (claim.count !== 1) continue; // someone else got it

    async function markFailed() {
      await prisma.scheduledMessage
        .update({ where: { id: sm.id }, data: { sentAt: null, failedAt: new Date() } })
        .catch(() => {});
    }

    try {
      // The scheduler must still be able to post here at send time: channel
      // exists, isn't archived, and they're still a member.
      const [channel, membership] = await Promise.all([
        prisma.channel.findUnique({
          where: { id: sm.channelId },
          select: { name: true, isDm: true, archivedAt: true },
        }),
        prisma.channelMember.findUnique({
          where: { channelId_userId: { channelId: sm.channelId, userId: sm.userId } },
          select: { id: true },
        }),
      ]);

      if (!channel || channel.archivedAt || !membership) {
        await markFailed();
        failed++;
        continue;
      }

      await deliverMessage({
        channelId: sm.channelId,
        userId: sm.userId,
        body: decryptMessage(sm.body),
        parentId: sm.parentId,
        attachmentIds: sm.attachmentIds,
        mentionedUserIds: sm.mentionedUserIds,
        channel: { name: channel.name, isDm: channel.isDm },
      });
      delivered++;
    } catch (err) {
      console.error("Scheduled dispatch failed for", sm.id, err);
      await markFailed();
      failed++;
    }
  }

  return NextResponse.json({ delivered, failed, considered: due.length });
}
