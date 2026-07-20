import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId, checkChannelAccess } from "@/lib/authz";

const MAX_AHEAD_MS = 365 * 24 * 60 * 60 * 1000; // a year
const MIN_AHEAD_MS = 30 * 1000; // at least ~30s out

// POST /api/reminders — "remind me about this message" at a chosen time. The
// dispatcher (POST /api/scheduled/dispatch) fires it and materializes a
// REMINDER notification linking back to the message. Self-scoped: you can only
// set a reminder on a message in a channel you can access.
export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const b = json as { messageId?: unknown; remindAt?: unknown };

  const messageId = String(b.messageId ?? "");
  if (!messageId) return NextResponse.json({ error: "messageId is required" }, { status: 400 });

  const remindAt = new Date(String(b.remindAt ?? ""));
  const ahead = remindAt.getTime() - Date.now();
  if (Number.isNaN(remindAt.getTime()) || ahead < MIN_AHEAD_MS || ahead > MAX_AHEAD_MS) {
    return NextResponse.json({ error: "Pick a time between a moment and a year from now" }, { status: 400 });
  }

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { channelId: true, deletedAt: true },
  });
  if (!message || message.deletedAt) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  const access = await checkChannelAccess(userId, message.channelId);
  if (!access.ok) return NextResponse.json({ error: "No access" }, { status: access.status });

  const reminder = await prisma.reminder.create({
    data: { userId, channelId: message.channelId, messageId, remindAt },
    select: { id: true, remindAt: true },
  });
  return NextResponse.json({ id: reminder.id, remindAt: reminder.remindAt.toISOString() }, { status: 201 });
}
