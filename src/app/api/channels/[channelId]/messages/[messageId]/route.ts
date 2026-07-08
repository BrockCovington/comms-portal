import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId, checkChannelAccess } from "@/lib/authz";
import { editMessageSchema } from "@/lib/validation";
import { encryptMessage } from "@/lib/crypto";
import { pusherServer, pusherChannelName } from "@/lib/pusher";

type RouteContext = { params: Promise<{ channelId: string; messageId: string }> };

async function loadOwnedMessage(channelId: string, messageId: string, userId: string) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { channelId: true, userId: true, parentId: true, deletedAt: true },
  });
  if (!message || message.channelId !== channelId) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  if (message.userId !== userId) {
    return { error: NextResponse.json({ error: "Not your message" }, { status: 403 }) };
  }
  return { message };
}

// PATCH /api/channels/:channelId/messages/:messageId — edit (author only)
export async function PATCH(request: Request, { params }: RouteContext) {
  const { channelId, messageId } = await params;
  const userId = await getCurrentUserId();

  const access = await checkChannelAccess(userId, channelId);
  if (!access.ok) {
    return NextResponse.json({ error: "No access" }, { status: access.status });
  }

  const owned = await loadOwnedMessage(channelId, messageId, userId!);
  if ("error" in owned) return owned.error;
  if (owned.message.deletedAt) {
    return NextResponse.json({ error: "Cannot edit a deleted message" }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = editMessageSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const updated = await prisma.message.update({
    where: { id: messageId },
    data: { body: encryptMessage(parsed.data.body), editedAt: new Date() },
    select: { id: true, parentId: true, editedAt: true, deletedAt: true },
  });

  const message = { ...updated, body: parsed.data.body };

  try {
    await pusherServer.trigger(pusherChannelName(channelId), "message-updated", { message });
  } catch (err) {
    console.error("Pusher broadcast failed:", err);
  }

  return NextResponse.json({ message });
}

// DELETE /api/channels/:channelId/messages/:messageId — soft-delete (author only)
export async function DELETE(_request: Request, { params }: RouteContext) {
  const { channelId, messageId } = await params;
  const userId = await getCurrentUserId();

  const access = await checkChannelAccess(userId, channelId);
  if (!access.ok) {
    return NextResponse.json({ error: "No access" }, { status: access.status });
  }

  const owned = await loadOwnedMessage(channelId, messageId, userId!);
  if ("error" in owned) return owned.error;

  // Idempotent: deleting an already-deleted message is a no-op success.
  if (owned.message.deletedAt) {
    return NextResponse.json({
      message: { id: messageId, parentId: owned.message.parentId, deletedAt: owned.message.deletedAt },
    });
  }

  const updated = await prisma.message.update({
    where: { id: messageId },
    data: { deletedAt: new Date() },
    select: { id: true, parentId: true, deletedAt: true },
  });

  const message = { ...updated, body: "" };

  try {
    await pusherServer.trigger(pusherChannelName(channelId), "message-updated", { message });
  } catch (err) {
    console.error("Pusher broadcast failed:", err);
  }

  return NextResponse.json({ message });
}
