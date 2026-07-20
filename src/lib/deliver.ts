import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { encryptMessage } from "@/lib/crypto";
import { pusherServer, pusherChannelName, userChannelName } from "@/lib/pusher";
import { extractFirstUrl, fetchLinkPreview } from "@/lib/unfurl";
import type { NotificationType } from "@prisma/client";

// ---------------------------------------------------------------------------
// The single message-delivery path, shared by a live send (POST
// /api/channels/:id/messages) and the scheduled-message dispatcher. Doing it
// once means a scheduled message fires with exactly the same behavior as a
// live one: encryption at rest, notification preferences (mute / level /
// keyword / DND), Pusher broadcasts, and link unfurling.
// ---------------------------------------------------------------------------

const NOTIFICATION_PREVIEW_LENGTH = 80;

// The channel members currently connected to the channel's Pusher presence
// channel — i.e. who's actually "here" right now — for expanding an @here
// mention. Returns null (not an empty list) when the lookup is unavailable, so
// the caller can distinguish "nobody is here" from "couldn't tell" and fall
// back accordingly.
async function presentMemberIds(channelId: string, memberSet: Set<string>): Promise<string[] | null> {
  try {
    const res = await pusherServer.get({ path: `/channels/presence-channel-${channelId}/users` });
    if (res.status !== 200) return null;
    const data = (await res.json()) as { users?: { id: string }[] };
    return (data.users ?? []).map((u) => u.id).filter((id) => memberSet.has(id));
  } catch (err) {
    console.error("@here presence lookup failed; falling back to all members:", err);
    return null;
  }
}

function encryptOrNull(value: string | null): string | null {
  return value === null ? null : encryptMessage(value);
}

// Fetch a link preview for the first URL in `body` and, if found, persist it
// (encrypted) and broadcast it. Runs via after() so it never delays delivery.
async function unfurlInBackground(
  messageId: string,
  channelId: string,
  parentId: string | null,
  body: string
) {
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

    await pusherServer.trigger(pusherChannelName(channelId), "message-updated", {
      message: { id: messageId, parentId, linkPreview: preview },
    });
  } catch (err) {
    console.error("Link unfurl failed:", err);
  }
}

export type DeliverInput = {
  channelId: string;
  userId: string;
  body: string; // plaintext (may be "")
  parentId?: string | null;
  attachmentIds?: string[];
  mentionedUserIds?: string[];
  channel: { name: string; isDm: boolean };
};

export type DeliveredMessage = {
  id: string;
  parentId: string | null;
  createdAt: Date;
  editedAt: Date | null;
  user: { id: string; name: string | null; image: string | null };
  body: string;
  attachments: { id: string; fileName: string; mimeType: string; size: number }[];
};

export async function deliverMessage(input: DeliverInput): Promise<{ message: DeliveredMessage }> {
  const { channelId, userId, body, channel } = input;

  // A reply must thread onto a root message still in this channel. If the
  // parent is gone (e.g. deleted between scheduling and delivery), fall back
  // to delivering as a normal channel message rather than failing.
  let parent: { userId: string } | null = null;
  let parentId: string | null = null;
  if (input.parentId) {
    const p = await prisma.message.findUnique({
      where: { id: input.parentId },
      select: { channelId: true, parentId: true, userId: true },
    });
    if (p && p.channelId === channelId && !p.parentId) {
      parent = { userId: p.userId };
      parentId = input.parentId;
    }
  }

  const created = await prisma.message.create({
    data: {
      channelId,
      userId,
      parentId,
      body: encryptMessage(body), // encrypt before it touches the DB
    },
    select: {
      id: true,
      parentId: true,
      createdAt: true,
      editedAt: true,
      user: { select: { id: true, name: true, image: true, statusEmoji: true, statusText: true, statusExpiresAt: true } },
    },
  });

  // Claim any orphan attachments. The compound where prevents linking
  // someone else's attachment, one from a different channel, or one already
  // attached to another message.
  let attachments: { id: string; fileName: string; mimeType: string; size: number }[] = [];
  if (input.attachmentIds?.length) {
    await prisma.attachment.updateMany({
      where: { id: { in: input.attachmentIds }, channelId, messageId: null, uploadedById: userId },
      data: { messageId: created.id },
    });
    attachments = await prisma.attachment.findMany({
      where: { messageId: created.id },
      select: { id: true, fileName: true, mimeType: true, size: true },
    });
  }

  const message: DeliveredMessage = { ...created, body, attachments };

  // Notifications, priority order: MENTION > KEYWORD > THREAD_REPLY > DM >
  // CHANNEL. Per-recipient prefs (mute, level, keyword, DND) applied after.
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

  if (input.mentionedUserIds?.length) {
    const targets = new Set(input.mentionedUserIds);

    // Individual @user mentions — validated against real membership.
    for (const id of input.mentionedUserIds) {
      if (memberSet.has(id)) addRecipient(id, "MENTION");
    }

    // Broadcast mentions. @channel/@everyone → every member. @here → members
    // currently present in the channel (Slack semantics), resolved from the
    // Pusher presence channel; on lookup failure we fall back to all members so
    // a broadcast is never silently dropped.
    if (targets.has("@channel") || targets.has("@everyone")) {
      for (const id of memberIds) addRecipient(id, "MENTION");
    } else if (targets.has("@here")) {
      const present = await presentMemberIds(channelId, memberSet);
      for (const id of present ?? memberIds) addRecipient(id, "MENTION");
    }
  }
  if (channel.isDm) {
    for (const id of memberIds) addRecipient(id, "DM");
  }
  if (parent) {
    addRecipient(parent.userId, "THREAD_REPLY");
    const repliers = await prisma.message.findMany({
      where: { parentId },
      select: { userId: true },
      distinct: ["userId"],
    });
    for (const r of repliers) addRecipient(r.userId, "THREAD_REPLY");
  }

  const bodyLower = body.toLowerCase();
  if (bodyLower) {
    for (const id of memberIds) {
      const keywords = globalPref.get(id)?.keywords ?? [];
      if (keywords.some((k) => k && bodyLower.includes(k))) addRecipient(id, "KEYWORD");
    }
  }

  for (const id of memberIds) {
    if (channelPref.get(id)?.level === "ALL") addRecipient(id, "CHANNEL");
  }

  for (const id of [...recipientTypes.keys()]) {
    const cp = channelPref.get(id);
    if (cp?.muted || cp?.level === "NONE") recipientTypes.delete(id);
  }

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
        actorId: userId,
        type,
        channelId,
        messageId: created.id,
        parentId,
      })),
      select: { id: true, userId: true, type: true },
    });

    const preview = body.slice(0, NOTIFICATION_PREVIEW_LENGTH);
    const actorName = created.user.name ?? "Someone";

    try {
      await Promise.all(
        notifications
          .filter((n) => !dndUserIds.has(n.userId))
          .map((n) =>
            pusherServer.trigger(userChannelName(n.userId), "notification", {
              id: n.id,
              type: n.type,
              channelId,
              channelName: channel.name,
              isDm: channel.isDm,
              messageId: created.id,
              parentId,
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

  try {
    await pusherServer.trigger(
      pusherChannelName(channelId),
      parentId ? "new-reply" : "new-message",
      { message }
    );
  } catch (err) {
    console.error("Pusher broadcast failed:", err);
  }

  if (body) {
    after(() => unfurlInBackground(created.id, channelId, parentId, body));
  }

  return { message };
}
