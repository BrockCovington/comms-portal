import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId, checkChannelAccess } from "@/lib/authz";
import { pusherServer, pusherChannelName } from "@/lib/pusher";
import { deliverMessage } from "@/lib/deliver";
import { decryptForwarded } from "@/lib/forward";

type RouteContext = { params: Promise<{ channelId: string }> };

const forwardSchema = z.object({
  sourceChannelId: z.string().cuid(),
  messageId: z.string().cuid(),
  comment: z.string().trim().max(4000, "Comment is too long").optional(),
});

// POST /api/channels/:channelId/forward — forward a message into this
// (target) channel, with an optional comment. The forwarded message is a
// normal message whose body is the comment; the embedded original is
// snapshotted into ForwardedMessage.
export async function POST(request: Request, { params }: RouteContext) {
  const { channelId } = await params; // target
  const userId = await getCurrentUserId();

  // Must be able to post to the target...
  const target = await checkChannelAccess(userId, channelId);
  if (!target.ok) {
    return NextResponse.json({ error: "No access" }, { status: target.status });
  }
  if (target.channel.archivedAt) {
    return NextResponse.json({ error: "This channel is archived" }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = forwardSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  // ...and must be able to see the SOURCE. This is the security gate: you
  // can only forward a message from a channel you have access to.
  const source = await checkChannelAccess(userId, parsed.data.sourceChannelId);
  if (!source.ok) {
    return NextResponse.json({ error: "No access to the source message" }, { status: 403 });
  }

  const original = await prisma.message.findUnique({
    where: { id: parsed.data.messageId },
    select: {
      channelId: true,
      body: true,
      deletedAt: true,
      createdAt: true,
      user: { select: { name: true } },
    },
  });
  if (!original || original.channelId !== parsed.data.sourceChannelId) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }
  if (original.deletedAt) {
    return NextResponse.json({ error: "Can't forward a deleted message" }, { status: 400 });
  }

  // Deliver the comment as a normal message (encryption, notifications,
  // broadcast all handled by the shared path). Empty comment ⇒ empty body,
  // which renders as just the forwarded embed.
  const { message } = await deliverMessage({
    channelId,
    userId: userId!,
    body: parsed.data.comment ?? "",
    channel: { name: target.channel.name, isDm: target.channel.isDm },
  });

  // Snapshot the original alongside the new message. A DM source is labeled
  // generically ("a direct message") rather than exposing the DM's debug
  // channel name.
  const created = await prisma.forwardedMessage.create({
    data: {
      messageId: message.id,
      sourceLabel: source.channel.isDm ? "a direct message" : source.channel.name,
      sourceIsDm: source.channel.isDm,
      sourceAuthorName: original.user.name,
      body: original.body, // copy the existing ciphertext (same at-rest key)
      originalCreatedAt: original.createdAt,
    },
    select: {
      sourceLabel: true,
      sourceIsDm: true,
      sourceAuthorName: true,
      body: true,
      originalCreatedAt: true,
    },
  });
  const forwarded = decryptForwarded(created);

  // Merge the embed onto the just-broadcast message (same message-updated
  // pattern link previews use — clients merge partial fields by id).
  try {
    await pusherServer.trigger(pusherChannelName(channelId), "message-updated", {
      message: { id: message.id, parentId: null, forwarded },
    });
  } catch (err) {
    console.error("Forward broadcast failed:", err);
  }

  return NextResponse.json({ message: { ...message, forwarded } }, { status: 201 });
}
