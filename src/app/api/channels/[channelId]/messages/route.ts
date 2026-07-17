import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId, checkChannelAccess } from "@/lib/authz";
import { postMessageSchema } from "@/lib/validation";
import { decryptMessage } from "@/lib/crypto";
import { checkMessageRateLimit } from "@/lib/ratelimit";
import { decryptLinkPreview } from "@/lib/unfurl";
import { decryptForwarded } from "@/lib/forward";
import { deliverMessage } from "@/lib/deliver";

type RouteContext = { params: Promise<{ channelId: string }> };

const PAGE_SIZE = 100;

// GET /api/channels/:channelId/messages — a page of root messages, newest
// first internally then reversed for display (oldest-first). Without
// ?before, returns the newest PAGE_SIZE. Pass ?before=<messageId> to load
// the PAGE_SIZE messages immediately older than that one — same cursor
// pattern as the thread route's reply pagination.
export async function GET(request: Request, { params }: RouteContext) {
  const { channelId } = await params;
  const userId = await getCurrentUserId();

  const access = await checkChannelAccess(userId, channelId);
  if (!access.ok) {
    return NextResponse.json({ error: "No access" }, { status: access.status });
  }

  const beforeId = new URL(request.url).searchParams.get("before");

  const rows = await prisma.message.findMany({
    where: { channelId, parentId: null },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE + 1, // one extra to detect hasMore
    ...(beforeId ? { cursor: { id: beforeId }, skip: 1 } : {}),
    select: {
      id: true,
      body: true,
      createdAt: true,
      editedAt: true,
      deletedAt: true,
      user: { select: { id: true, name: true, image: true, statusEmoji: true, statusText: true, statusExpiresAt: true } },
      _count: { select: { replies: true } },
    },
  });

  const hasMore = rows.length > PAGE_SIZE;
  if (hasMore) rows.length = PAGE_SIZE;

  // Thread previews need the most recent reply time, and whether the current
  // user has unread replies, too. Two extra queries for the messages that
  // actually have replies, rather than N+1.
  const idsWithReplies = rows
    .filter((r) => r._count.replies > 0)
    .map((r) => r.id);
  const [lastReplyRows, threadReadRows] = idsWithReplies.length
    ? await Promise.all([
        prisma.message.groupBy({
          by: ["parentId"],
          where: { parentId: { in: idsWithReplies } },
          _max: { createdAt: true },
        }),
        prisma.threadRead.findMany({
          where: { userId: userId!, parentId: { in: idsWithReplies } },
          select: { parentId: true, lastReadAt: true },
        }),
      ])
    : [[], []];
  const lastReplyAtByParent = new Map(
    lastReplyRows.map((r) => [r.parentId, r._max.createdAt])
  );
  const threadReadAtByParent = new Map(
    threadReadRows.map((r) => [r.parentId, r.lastReadAt])
  );

  // Same "one extra query for the visible ids, aggregate in memory" pattern.
  const ids = rows.map((r) => r.id);
  const [reactionRows, attachmentRows, savedRows, linkPreviewRows, pinnedRows, forwardedRows] =
    ids.length
    ? await Promise.all([
        prisma.reaction.findMany({
          where: { messageId: { in: ids } },
          select: { messageId: true, emoji: true, userId: true },
        }),
        prisma.attachment.findMany({
          where: { messageId: { in: ids } },
          select: { id: true, messageId: true, fileName: true, mimeType: true, size: true },
        }),
        prisma.savedMessage.findMany({
          where: { userId: userId!, messageId: { in: ids } },
          select: { messageId: true },
        }),
        prisma.linkPreview.findMany({
          where: { messageId: { in: ids } },
          select: { messageId: true, url: true, title: true, description: true, imageUrl: true, siteName: true },
        }),
        prisma.pinnedMessage.findMany({
          where: { messageId: { in: ids } },
          select: { messageId: true },
        }),
        prisma.forwardedMessage.findMany({
          where: { messageId: { in: ids } },
          select: { messageId: true, sourceLabel: true, sourceIsDm: true, sourceAuthorName: true, body: true, originalCreatedAt: true },
        }),
      ])
    : [[], [], [], [], [], []];
  const savedIds = new Set(savedRows.map((s) => s.messageId));
  const pinnedIds = new Set(pinnedRows.map((p) => p.messageId));
  const linkPreviewByMessage = new Map(
    linkPreviewRows.map((p) => [p.messageId, decryptLinkPreview(p)])
  );
  const forwardedByMessage = new Map(
    forwardedRows.map((f) => [f.messageId, decryptForwarded(f)])
  );
  const reactionsByMessage = new Map<string, { emoji: string; count: number; mine: boolean }[]>();
  for (const r of reactionRows) {
    const list = reactionsByMessage.get(r.messageId) ?? [];
    const entry = list.find((e) => e.emoji === r.emoji);
    if (entry) {
      entry.count += 1;
      if (r.userId === userId) entry.mine = true;
    } else {
      list.push({ emoji: r.emoji, count: 1, mine: r.userId === userId });
    }
    reactionsByMessage.set(r.messageId, list);
  }
  const attachmentsByMessage = new Map<
    string,
    { id: string; fileName: string; mimeType: string; size: number }[]
  >();
  for (const a of attachmentRows) {
    const list = attachmentsByMessage.get(a.messageId!) ?? [];
    list.push({ id: a.id, fileName: a.fileName, mimeType: a.mimeType, size: a.size });
    attachmentsByMessage.set(a.messageId!, list);
  }

  const messages = rows
    .reverse()
    .map(({ _count, ...m }) => {
      const lastReplyAt = lastReplyAtByParent.get(m.id) ?? null;
      const threadReadAt = threadReadAtByParent.get(m.id) ?? null;
      return {
        ...m,
        body: m.deletedAt ? "" : decryptMessage(m.body),
        replyCount: _count.replies,
        lastReplyAt,
        threadUnread: !!lastReplyAt && (!threadReadAt || lastReplyAt > threadReadAt),
        reactions: reactionsByMessage.get(m.id) ?? [],
        attachments: attachmentsByMessage.get(m.id) ?? [],
        savedByMe: savedIds.has(m.id),
        linkPreview: linkPreviewByMessage.get(m.id) ?? null,
        isPinned: pinnedIds.has(m.id),
        forwarded: forwardedByMessage.get(m.id) ?? null,
      };
    });

  // Read receipts (DMs only): the other participant's last-read time, so the
  // client can show "Seen" under the most recent message they've read. Only
  // fetched for DMs — that's the only place receipts render.
  const readReceipts = access.channel.isDm
    ? (
        await prisma.channelRead.findMany({
          where: { channelId, userId: { not: userId! } },
          select: { userId: true, lastReadAt: true },
        })
      ).map((r) => ({ userId: r.userId, lastReadAt: r.lastReadAt.toISOString() }))
    : [];

  return NextResponse.json({
    messages,
    hasMore,
    nextCursor: hasMore ? messages[0].id : null,
    readReceipts,
  });
}

// POST /api/channels/:channelId/messages — send a message
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

  // Checked after access (no point spending a rate-limit slot on a request
  // that was going to be rejected anyway), before parsing the body.
  const rateLimit = await checkMessageRateLimit(userId!);
  if (!rateLimit.ok) {
    const retryAfterSeconds = Math.max(1, Math.ceil((rateLimit.reset - Date.now()) / 1000));
    return NextResponse.json(
      { error: "You're sending messages too fast — wait a few seconds and try again." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = postMessageSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { message } = await deliverMessage({
    channelId,
    userId: userId!,
    body: parsed.data.body ?? "",
    parentId: parsed.data.parentId ?? null,
    attachmentIds: parsed.data.attachmentIds,
    mentionedUserIds: parsed.data.mentionedUserIds,
    channel: { name: access.channel.name, isDm: access.channel.isDm },
  });

  return NextResponse.json({ message }, { status: 201 });
}
