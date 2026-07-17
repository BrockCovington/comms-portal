import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId, checkChannelAccess } from "@/lib/authz";
import { decryptMessage } from "@/lib/crypto";
import { decryptLinkPreview } from "@/lib/unfurl";
import { decryptForwarded } from "@/lib/forward";

type RouteContext = { params: Promise<{ channelId: string; messageId: string }> };

const PAGE_SIZE = 50;

const MESSAGE_SELECT = {
  id: true,
  body: true,
  createdAt: true,
  editedAt: true,
  deletedAt: true,
  user: { select: { id: true, name: true, image: true, statusEmoji: true, statusText: true, statusExpiresAt: true } },
} as const;

function renderBody<T extends { body: string; deletedAt: Date | null }>(m: T) {
  return { ...m, body: m.deletedAt ? "" : decryptMessage(m.body) };
}

function groupReactions(
  rows: { messageId: string; emoji: string; userId: string }[],
  currentUserId: string
): Map<string, { emoji: string; count: number; mine: boolean }[]> {
  const byMessage = new Map<string, { emoji: string; count: number; mine: boolean }[]>();
  for (const r of rows) {
    const list = byMessage.get(r.messageId) ?? [];
    const entry = list.find((e) => e.emoji === r.emoji);
    if (entry) {
      entry.count += 1;
      if (r.userId === currentUserId) entry.mine = true;
    } else {
      list.push({ emoji: r.emoji, count: 1, mine: r.userId === currentUserId });
    }
    byMessage.set(r.messageId, list);
  }
  return byMessage;
}

// GET /api/channels/:channelId/messages/:messageId/thread — a root message
// plus a page of its replies. Without ?before, returns the newest PAGE_SIZE
// replies (oldest-first for display). Pass ?before=<replyId> to load the
// PAGE_SIZE replies immediately older than that reply.
export async function GET(request: Request, { params }: RouteContext) {
  const { channelId, messageId } = await params;
  const userId = await getCurrentUserId();

  const access = await checkChannelAccess(userId, channelId);
  if (!access.ok) {
    return NextResponse.json({ error: "No access" }, { status: access.status });
  }

  const parent = await prisma.message.findUnique({
    where: { id: messageId },
    select: { channelId: true, ...MESSAGE_SELECT },
  });
  if (!parent || parent.channelId !== channelId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const beforeId = new URL(request.url).searchParams.get("before");

  const rows = await prisma.message.findMany({
    where: { parentId: messageId },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE + 1, // one extra to detect hasMore
    ...(beforeId ? { cursor: { id: beforeId }, skip: 1 } : {}),
    select: MESSAGE_SELECT,
  });

  const hasMore = rows.length > PAGE_SIZE;
  const replies = rows.slice(0, PAGE_SIZE).reverse(); // oldest-first for display

  const idsInView = [messageId, ...replies.map((r) => r.id)];
  const [reactionRows, attachmentRows, savedRows, linkPreviewRows, pinnedRows, forwardedRows] =
    await Promise.all([
      prisma.reaction.findMany({
        where: { messageId: { in: idsInView } },
        select: { messageId: true, emoji: true, userId: true },
      }),
      prisma.attachment.findMany({
        where: { messageId: { in: idsInView } },
        select: { id: true, messageId: true, fileName: true, mimeType: true, size: true },
      }),
      prisma.savedMessage.findMany({
        where: { userId: userId!, messageId: { in: idsInView } },
        select: { messageId: true },
      }),
      prisma.linkPreview.findMany({
        where: { messageId: { in: idsInView } },
        select: { messageId: true, url: true, title: true, description: true, imageUrl: true, siteName: true },
      }),
      prisma.pinnedMessage.findMany({
        where: { messageId: { in: idsInView } },
        select: { messageId: true },
      }),
      prisma.forwardedMessage.findMany({
        where: { messageId: { in: idsInView } },
        select: { messageId: true, sourceLabel: true, sourceIsDm: true, sourceAuthorName: true, body: true, originalCreatedAt: true },
      }),
    ]);
  const savedIds = new Set(savedRows.map((s) => s.messageId));
  const pinnedIds = new Set(pinnedRows.map((p) => p.messageId));
  const linkPreviewByMessage = new Map(
    linkPreviewRows.map((p) => [p.messageId, decryptLinkPreview(p)])
  );
  const forwardedByMessage = new Map(
    forwardedRows.map((f) => [f.messageId, decryptForwarded(f)])
  );
  const reactionsByMessage = groupReactions(reactionRows, userId!);
  const attachmentsByMessage = new Map<
    string,
    { id: string; fileName: string; mimeType: string; size: number }[]
  >();
  for (const a of attachmentRows) {
    const list = attachmentsByMessage.get(a.messageId!) ?? [];
    list.push({ id: a.id, fileName: a.fileName, mimeType: a.mimeType, size: a.size });
    attachmentsByMessage.set(a.messageId!, list);
  }

  const { channelId: _channelId, ...parentFields } = parent;
  const response = {
    parent: {
      ...renderBody(parentFields),
      reactions: reactionsByMessage.get(messageId) ?? [],
      attachments: attachmentsByMessage.get(messageId) ?? [],
      savedByMe: savedIds.has(messageId),
      linkPreview: linkPreviewByMessage.get(messageId) ?? null,
      isPinned: pinnedIds.has(messageId),
      forwarded: forwardedByMessage.get(messageId) ?? null,
    },
    replies: replies.map((r) => ({
      ...renderBody(r),
      reactions: reactionsByMessage.get(r.id) ?? [],
      attachments: attachmentsByMessage.get(r.id) ?? [],
      savedByMe: savedIds.has(r.id),
      linkPreview: linkPreviewByMessage.get(r.id) ?? null,
      isPinned: pinnedIds.has(r.id),
      forwarded: forwardedByMessage.get(r.id) ?? null,
    })),
    hasMore,
    nextCursor: hasMore ? replies[0].id : null,
  };

  return NextResponse.json(response);
}
