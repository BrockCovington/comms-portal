import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId, checkChannelAccess } from "@/lib/authz";
import { scheduleMessageSchema } from "@/lib/validation";
import { encryptMessage, decryptMessage } from "@/lib/crypto";

type RouteContext = { params: Promise<{ channelId: string }> };

const PREVIEW_LENGTH = 140;
const MAX_AHEAD_MS = 365 * 24 * 60 * 60 * 1000; // 1 year

// GET /api/channels/:channelId/scheduled — this user's pending scheduled
// messages for the channel (not yet sent, canceled, or failed), soonest first.
export async function GET(_request: Request, { params }: RouteContext) {
  const { channelId } = await params;
  const userId = await getCurrentUserId();

  const access = await checkChannelAccess(userId, channelId);
  if (!access.ok) {
    return NextResponse.json({ error: "No access" }, { status: access.status });
  }

  const rows = await prisma.scheduledMessage.findMany({
    where: { channelId, userId: userId!, sentAt: null, canceledAt: null, failedAt: null },
    orderBy: { sendAt: "asc" },
    select: { id: true, body: true, sendAt: true, parentId: true },
  });

  const scheduled = rows.map((r) => ({
    id: r.id,
    preview: decryptMessage(r.body).slice(0, PREVIEW_LENGTH),
    sendAt: r.sendAt,
    isReply: !!r.parentId,
  }));

  return NextResponse.json({ scheduled });
}

// POST /api/channels/:channelId/scheduled — schedule a message for later.
export async function POST(request: Request, { params }: RouteContext) {
  const { channelId } = await params;
  const userId = await getCurrentUserId();

  const access = await checkChannelAccess(userId, channelId);
  if (!access.ok) {
    return NextResponse.json({ error: "No access" }, { status: access.status });
  }
  if (access.channel.archivedAt) {
    return NextResponse.json({ error: "This channel is archived" }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = scheduleMessageSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const sendAt = new Date(parsed.data.sendAt);
  const now = Date.now();
  if (sendAt.getTime() <= now + 30_000) {
    return NextResponse.json({ error: "Pick a time at least a minute from now" }, { status: 400 });
  }
  if (sendAt.getTime() > now + MAX_AHEAD_MS) {
    return NextResponse.json({ error: "Can't schedule more than a year ahead" }, { status: 400 });
  }

  // If it's a scheduled reply, sanity-check the thread parent up front (it's
  // re-checked at delivery too, since it could vanish in the meantime).
  if (parsed.data.parentId) {
    const parent = await prisma.message.findUnique({
      where: { id: parsed.data.parentId },
      select: { channelId: true, parentId: true },
    });
    if (!parent || parent.channelId !== channelId || parent.parentId) {
      return NextResponse.json({ error: "Invalid thread" }, { status: 400 });
    }
  }

  const created = await prisma.scheduledMessage.create({
    data: {
      channelId,
      userId: userId!,
      body: encryptMessage(parsed.data.body ?? ""),
      parentId: parsed.data.parentId ?? null,
      attachmentIds: parsed.data.attachmentIds ?? [],
      mentionedUserIds: parsed.data.mentionedUserIds ?? [],
      sendAt,
    },
    select: { id: true, sendAt: true },
  });

  return NextResponse.json({ scheduled: { id: created.id, sendAt: created.sendAt } }, { status: 201 });
}
