import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptMessage } from "@/lib/crypto";
import { deliverMessage } from "@/lib/deliver";
import { computeNextRun } from "@/lib/workflows";
import { pusherServer, userChannelName } from "@/lib/pusher";

const BATCH = 200;
const REMINDER_PREVIEW_LENGTH = 80;

// /api/scheduled/dispatch — delivers every scheduled message whose time has
// come, and fires every recurring Workflow that's due. Runs every minute via
// the Vercel Cron in vercel.json (GET), and also accepts POST so an external
// scheduler can drive it too. Protected by CRON_SECRET: without a matching
// bearer token it refuses (fail closed — this endpoint sends messages as
// users). Vercel Cron automatically sends `Authorization: Bearer $CRON_SECRET`
// when that env var is set, which is exactly what this checks.
export async function GET(request: Request) {
  return dispatch(request);
}

export async function POST(request: Request) {
  return dispatch(request);
}

async function dispatch(request: Request) {
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

  // --- Recurring workflows -------------------------------------------------
  // Every enabled workflow whose nextRunAt has passed fires once, then advances
  // to its next occurrence. Advancing nextRunAt *before* delivering doubles as
  // the claim: an overlapping dispatch run only proceeds if its updateMany
  // (matching the old nextRunAt) actually moved the row.
  const dueWorkflows = await prisma.workflow.findMany({
    where: { enabled: true, nextRunAt: { lte: now } },
    orderBy: { nextRunAt: "asc" },
    take: BATCH,
    select: {
      id: true,
      channelId: true,
      createdById: true,
      body: true,
      frequency: true,
      dayOfWeek: true,
      hour: true,
      minute: true,
      timezone: true,
      nextRunAt: true,
    },
  });

  let workflowsFired = 0;
  let workflowsFailed = 0;

  for (const wf of dueWorkflows) {
    const nextRunAt = computeNextRun(wf, now);
    const claim = await prisma.workflow.updateMany({
      where: { id: wf.id, enabled: true, nextRunAt: wf.nextRunAt },
      data: { nextRunAt, lastRunAt: now, runCount: { increment: 1 } },
    });
    if (claim.count !== 1) continue; // another run already advanced it

    try {
      // The author must still be able to post here. If the channel is gone /
      // archived or they've lost membership, disable the workflow rather than
      // failing every minute forever.
      const [channel, membership] = await Promise.all([
        prisma.channel.findUnique({
          where: { id: wf.channelId },
          select: { name: true, isDm: true, isPrivate: true, archivedAt: true },
        }),
        prisma.channelMember.findUnique({
          where: { channelId_userId: { channelId: wf.channelId, userId: wf.createdById } },
          select: { id: true },
        }),
      ]);

      const authorCanPost =
        channel && !channel.archivedAt && (!(channel.isPrivate || channel.isDm) || membership);
      if (!authorCanPost) {
        await prisma.workflow.update({ where: { id: wf.id }, data: { enabled: false } }).catch(() => {});
        workflowsFailed++;
        continue;
      }

      await deliverMessage({
        channelId: wf.channelId,
        userId: wf.createdById,
        body: decryptMessage(wf.body),
        channel: { name: channel.name, isDm: channel.isDm },
      });
      workflowsFired++;
    } catch (err) {
      console.error("Workflow dispatch failed for", wf.id, err);
      workflowsFailed++;
      // nextRunAt already advanced — we skip this occurrence rather than retry.
    }
  }

  // --- Reminders -----------------------------------------------------------
  // Every due "remind me about this message" fires once, materializing a
  // REMINDER notification (linking back to the message) for its owner. Claiming
  // via firedAt keeps an overlapping run from double-firing.
  const dueReminders = await prisma.reminder.findMany({
    where: { remindAt: { lte: now }, firedAt: null },
    orderBy: { remindAt: "asc" },
    take: BATCH,
    select: { id: true, userId: true, channelId: true, messageId: true },
  });

  let remindersFired = 0;
  let remindersFailed = 0;

  for (const rem of dueReminders) {
    const claim = await prisma.reminder.updateMany({
      where: { id: rem.id, firedAt: null },
      data: { firedAt: now },
    });
    if (claim.count !== 1) continue; // another run got it

    try {
      const [channel, membership, message] = await Promise.all([
        prisma.channel.findUnique({
          where: { id: rem.channelId },
          select: { name: true, isDm: true, isPrivate: true },
        }),
        prisma.channelMember.findUnique({
          where: { channelId_userId: { channelId: rem.channelId, userId: rem.userId } },
          select: { id: true },
        }),
        prisma.message.findUnique({
          where: { id: rem.messageId },
          select: { body: true, deletedAt: true, parentId: true },
        }),
      ]);

      // Skip silently if the message is gone or the user can no longer see the
      // channel — a reminder linking somewhere they can't open is worse than none.
      const canAccess = channel && (!(channel.isPrivate || channel.isDm) || membership);
      if (!channel || !message || message.deletedAt || !canAccess) {
        remindersFailed++;
        continue;
      }

      const notif = await prisma.notification.create({
        data: {
          userId: rem.userId,
          actorId: rem.userId, // self-scheduled
          type: "REMINDER",
          channelId: rem.channelId,
          messageId: rem.messageId,
          parentId: message.parentId ?? null,
        },
        select: { id: true, createdAt: true },
      });

      const preview = decryptMessage(message.body).slice(0, REMINDER_PREVIEW_LENGTH);
      await pusherServer
        .trigger(userChannelName(rem.userId), "notification", {
          id: notif.id,
          type: "REMINDER",
          channelId: rem.channelId,
          channelName: channel.name,
          isDm: channel.isDm,
          messageId: rem.messageId,
          parentId: message.parentId ?? null,
          actorId: rem.userId,
          actorName: "Reminder",
          preview,
          createdAt: notif.createdAt,
          readAt: null,
        })
        .catch(() => {});
      remindersFired++;
    } catch (err) {
      console.error("Reminder dispatch failed for", rem.id, err);
      remindersFailed++;
    }
  }

  return NextResponse.json({
    delivered,
    failed,
    considered: due.length,
    workflowsFired,
    workflowsFailed,
    workflowsConsidered: dueWorkflows.length,
    remindersFired,
    remindersFailed,
    remindersConsidered: dueReminders.length,
  });
}
