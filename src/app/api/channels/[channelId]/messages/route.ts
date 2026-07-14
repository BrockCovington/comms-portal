import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId, checkChannelAccess } from "@/lib/authz";
import { postMessageSchema } from "@/lib/validation";
import { encryptMessage, decryptMessage } from "@/lib/crypto";
import { pusherServer, pusherChannelName, userChannelName } from "@/lib/pusher";
import { checkMessageRateLimit } from "@/lib/ratelimit";
import { extractFirstUrl, fetchLinkPreview, decryptLinkPreview } from "@/lib/unfurl";
import type { NotificationType } from "@prisma/client";

// Encrypt a possibly-null preview field the same way message bodies are
// encrypted (see the LinkPreview model comment) — null stays null.
function encryptOrNull(value: string | null): string | null {
  return value === null ? null : encryptMessage(value);
}

// Fetch a link preview for the first URL in `body` and, if one is found,
// persist it (encrypted) and broadcast it to everyone viewing the channel.
// Runs via after() so it never delays the send — the message is already
// saved and returned by the time this executes. Best-effort throughout: any
// failure just means no preview card, never a failed send.
async function unfurlInBackground(messageId: string, channelId: string, parentId: string | null, body: string) {
  try {
    const url = extractFirstUrl(body);
    if (!url) return;
    const preview = await fetchLinkPreview(url);
    if (!preview) return;

    await prisma.linkPreview.create({
      data: {
        messageId,
        url: encryptMessage(preview.url),
        title: encryptOrNull(preview.title),
        description: encryptOrNull(preview.description),
        imageUrl: encryptOrNull(preview.imageUrl),
        siteName: encryptOrNull(preview.siteName),
      },
    });

    // Reuse the existing message-updated event — clients already merge its
    // partial fields onto the matching message (root list or thread panel).
    // Plaintext preview over Pusher, same trust model as the message body.
    await pusherServer.trigger(pusherChannelName(channelId), "message-updated", {
      message: { id: messageId, parentId, linkPreview: preview },
    });
  } catch (err) {
    console.error("Link unfurl failed:", err);
  }
}

const NOTIFICATION_PREVIEW_LENGTH = 80;

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
      user: { select: { id: true, name: true, image: true } },
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
  const [reactionRows, attachmentRows, savedRows, linkPreviewRows, pinnedRows] = ids.length
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
      ])
    : [[], [], [], [], []];
  const savedIds = new Set(savedRows.map((s) => s.messageId));
  const pinnedIds = new Set(pinnedRows.map((p) => p.messageId));
  const linkPreviewByMessage = new Map(
    linkPreviewRows.map((p) => [p.messageId, decryptLinkPreview(p)])
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
      };
    });

  return NextResponse.json({
    messages,
    hasMore,
    nextCursor: hasMore ? messages[0].id : null,
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

  // A reply must thread onto a root message in this same channel — otherwise
  // a caller could dangle a reply off a message in a channel they can't see.
  let parent: { channelId: string; parentId: string | null; userId: string } | null = null;
  if (parsed.data.parentId) {
    parent = await prisma.message.findUnique({
      where: { id: parsed.data.parentId },
      select: { channelId: true, parentId: true, userId: true },
    });
    if (!parent || parent.channelId !== channelId || parent.parentId) {
      return NextResponse.json({ error: "Invalid thread" }, { status: 400 });
    }
  }

  const created = await prisma.message.create({
    data: {
      channelId,
      userId: userId!,
      parentId: parsed.data.parentId ?? null,
      body: encryptMessage(parsed.data.body ?? ""), // encrypt before it touches the DB
    },
    select: {
      id: true,
      parentId: true,
      createdAt: true,
      editedAt: true,
      user: { select: { id: true, name: true, image: true } },
    },
  });

  // Claim any orphan attachments the caller just uploaded. The compound
  // where is what prevents linking someone else's attachment, one from a
  // different channel, or one already attached to another message.
  let attachments: { id: string; fileName: string; mimeType: string; size: number }[] = [];
  if (parsed.data.attachmentIds?.length) {
    await prisma.attachment.updateMany({
      where: {
        id: { in: parsed.data.attachmentIds },
        channelId,
        messageId: null,
        uploadedById: userId!,
      },
      data: { messageId: created.id },
    });
    attachments = await prisma.attachment.findMany({
      where: { messageId: created.id },
      select: { id: true, fileName: true, mimeType: true, size: true },
    });
  }

  const message = { ...created, body: parsed.data.body ?? "", attachments };

  // Notifications, in priority order when someone qualifies more than one
  // way: MENTION (@you) > KEYWORD (your alert word) > THREAD_REPLY > DM >
  // CHANNEL (every-message, for channels set to "All"). Per-recipient
  // notification preferences (mute, level, keywords, DND) are applied after
  // the base set is built — see below.
  const recipientTypes = new Map<string, NotificationType>();
  const PRIORITY: Record<NotificationType, number> = {
    MENTION: 5,
    KEYWORD: 4,
    THREAD_REPLY: 3,
    DM: 2,
    CHANNEL: 1,
  };
  function addRecipient(candidateId: string, type: NotificationType) {
    if (candidateId === userId) return; // never notify yourself
    const existing = recipientTypes.get(candidateId);
    if (!existing || PRIORITY[type] > PRIORITY[existing]) {
      recipientTypes.set(candidateId, type);
    }
  }

  // Everyone in the channel (minus the sender) plus their prefs — needed
  // because keyword and "All"-level notifications can reach a member who
  // wasn't mentioned/replied-to at all.
  const memberRows = await prisma.channelMember.findMany({
    where: { channelId },
    select: { userId: true },
  });
  const memberIds = memberRows.map((m) => m.userId).filter((id) => id !== userId);
  const [channelPrefRows, globalPrefRows] = await Promise.all([
    prisma.channelPreference.findMany({
      where: { channelId, userId: { in: memberIds } },
      select: { userId: true, muted: true, level: true },
    }),
    prisma.notificationPreference.findMany({
      where: { userId: { in: memberIds } },
      select: { userId: true, dndUntil: true, keywords: true },
    }),
  ]);
  const channelPref = new Map(channelPrefRows.map((p) => [p.userId, p]));
  const globalPref = new Map(globalPrefRows.map((p) => [p.userId, p]));
  const memberSet = new Set(memberIds);

  if (parsed.data.mentionedUserIds?.length) {
    // Only ids that are actually members — never trust client-provided ids.
    for (const id of parsed.data.mentionedUserIds) {
      if (memberSet.has(id)) addRecipient(id, "MENTION");
    }
  }
  if (access.channel.isDm) {
    for (const id of memberIds) addRecipient(id, "DM");
  }
  if (parent) {
    addRecipient(parent.userId, "THREAD_REPLY");
    const repliers = await prisma.message.findMany({
      where: { parentId: parsed.data.parentId },
      select: { userId: true },
      distinct: ["userId"],
    });
    for (const r of repliers) addRecipient(r.userId, "THREAD_REPLY");
  }

  // Keyword alerts: notify any member whose alert word appears in the body.
  const bodyLower = (parsed.data.body ?? "").toLowerCase();
  if (bodyLower) {
    for (const id of memberIds) {
      const keywords = globalPref.get(id)?.keywords ?? [];
      if (keywords.some((k) => k && bodyLower.includes(k))) addRecipient(id, "KEYWORD");
    }
  }

  // "All"-level channels: every message notifies (lowest priority, so a
  // mention/keyword/etc. on the same message still wins the type).
  for (const id of memberIds) {
    if (channelPref.get(id)?.level === "ALL") addRecipient(id, "CHANNEL");
  }

  // Apply per-channel suppression: a muted channel or a "Nothing" level
  // drops the recipient entirely, whatever the reason they'd have qualified.
  for (const id of [...recipientTypes.keys()]) {
    const cp = channelPref.get(id);
    if (cp?.muted || cp?.level === "NONE") recipientTypes.delete(id);
  }

  // Do Not Disturb: these recipients still GET the notification (it shows in
  // their Activity feed later) but no live push/toast is sent right now.
  const now = created.createdAt;
  const dndUserIds = new Set(
    memberIds.filter((id) => {
      const until = globalPref.get(id)?.dndUntil;
      return until && until > now;
    })
  );

  if (recipientTypes.size > 0) {
    const notifications = await prisma.notification.createManyAndReturn({
      data: [...recipientTypes.entries()].map(([recipientId, type]) => ({
        userId: recipientId,
        actorId: userId!,
        type,
        channelId,
        messageId: created.id,
        parentId: message.parentId,
      })),
      select: { id: true, userId: true, type: true },
    });

    // Ephemeral preview only — never persisted (see Notification model's
    // comment: bodies are encrypted at rest, this mirrors the same
    // plaintext-over-Pusher trust model the message broadcast already uses).
    const preview = (parsed.data.body ?? "").slice(0, NOTIFICATION_PREVIEW_LENGTH);
    const actorName = created.user.name ?? "Someone";

    try {
      await Promise.all(
        // DND recipients get the stored notification but no live push/toast.
        notifications
          .filter((n) => !dndUserIds.has(n.userId))
          .map((n) =>
          pusherServer.trigger(userChannelName(n.userId), "notification", {
            id: n.id,
            type: n.type,
            channelId,
            channelName: access.channel.name,
            isDm: access.channel.isDm,
            messageId: created.id,
            parentId: message.parentId,
            actorId: userId,
            actorName,
            preview,
            createdAt: created.createdAt,
            readAt: null,
          })
        )
      );
    } catch (err) {
      console.error("Notification broadcast failed:", err);
    }
  }

  // Broadcast to everyone currently viewing this channel. Only subscribers who
  // passed the auth check in /api/pusher/auth are on this private channel.
  // Note: message text is relayed through Pusher (over TLS). It is the same
  // trust model as the rest of the app (not end-to-end encrypted).
  // Replies get their own event so the root message list only updates the
  // parent's thread preview instead of appending the reply inline.
  try {
    await pusherServer.trigger(
      pusherChannelName(channelId),
      message.parentId ? "new-reply" : "new-message",
      { message }
    );
  } catch (err) {
    // A failed broadcast shouldn't fail the send — the message is already
    // saved, and other clients will still see it on their next load.
    console.error("Pusher broadcast failed:", err);
  }

  // Unfurl any link in the body after the response is sent — the message is
  // already saved and broadcast, so the preview arriving a beat later is
  // exactly the Slack behavior (message instant, card pops in).
  if (parsed.data.body) {
    after(() => unfurlInBackground(created.id, channelId, message.parentId, parsed.data.body!));
  }

  // Return the plaintext we just stored (don't round-trip through the DB).
  return NextResponse.json({ message }, { status: 201 });
}
