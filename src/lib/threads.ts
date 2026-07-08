import { prisma } from "@/lib/prisma";
import { decryptMessage } from "@/lib/crypto";
import { otherMemberLabel } from "@/lib/dm";

export type ThreadSummary = {
  id: string;
  channelId: string;
  channelName: string;
  isDm: boolean;
  preview: string;
  authorName: string | null;
  replyCount: number;
  lastReplyAt: Date | null;
  unread: boolean;
};

// Shared by GET /api/threads and the /threads page. "Threads I'm in" reuses
// the exact rule already coded for THREAD_REPLY notifications in the
// messages POST route: the root message's author, or anyone who's replied
// — no separate channel-access check needed, since you can't have authored
// or replied to a message in a channel you didn't already have access to.
export async function getThreadsForUser(userId: string): Promise<ThreadSummary[]> {
  const [repliedParents, startedThreads] = await Promise.all([
    prisma.message.findMany({
      where: { userId, parentId: { not: null } },
      select: { parentId: true },
      distinct: ["parentId"],
    }),
    prisma.message.findMany({
      where: { userId, parentId: null, replies: { some: {} } },
      select: { id: true },
    }),
  ]);

  const threadIds = new Set<string>();
  repliedParents.forEach((r) => r.parentId && threadIds.add(r.parentId));
  startedThreads.forEach((m) => threadIds.add(m.id));
  if (threadIds.size === 0) return [];

  const ids = [...threadIds];

  const [parents, lastReplyRows, threadReadRows] = await Promise.all([
    prisma.message.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        body: true,
        deletedAt: true,
        channelId: true,
        channel: { select: { name: true, isDm: true } },
        user: { select: { name: true } },
        _count: { select: { replies: true } },
      },
    }),
    prisma.message.groupBy({
      by: ["parentId"],
      where: { parentId: { in: ids } },
      _max: { createdAt: true },
    }),
    prisma.threadRead.findMany({
      where: { userId, parentId: { in: ids } },
      select: { parentId: true, lastReadAt: true },
    }),
  ]);

  // DM channel names are a fixed internal debug label, never rendered —
  // resolve the real display name the same way the sidebar does.
  const dmChannelIds = parents.filter((p) => p.channel.isDm).map((p) => p.channelId);
  const dmMembers = dmChannelIds.length
    ? await prisma.channelMember.findMany({
        where: { channelId: { in: dmChannelIds } },
        select: { channelId: true, userId: true, user: { select: { name: true, email: true } } },
      })
    : [];
  const dmMembersByChannel = new Map<string, typeof dmMembers>();
  for (const m of dmMembers) {
    const list = dmMembersByChannel.get(m.channelId) ?? [];
    list.push(m);
    dmMembersByChannel.set(m.channelId, list);
  }

  const lastReplyAtByParent = new Map(lastReplyRows.map((r) => [r.parentId, r._max.createdAt]));
  const threadReadAtByParent = new Map(threadReadRows.map((r) => [r.parentId, r.lastReadAt]));

  return parents
    .map((p) => {
      const lastReplyAt = lastReplyAtByParent.get(p.id) ?? null;
      const threadReadAt = threadReadAtByParent.get(p.id) ?? null;
      const channelName = p.channel.isDm
        ? otherMemberLabel(dmMembersByChannel.get(p.channelId) ?? [], userId)
        : p.channel.name;
      return {
        id: p.id,
        channelId: p.channelId,
        channelName,
        isDm: p.channel.isDm,
        preview: p.deletedAt ? "" : decryptMessage(p.body).slice(0, 140),
        authorName: p.user.name,
        replyCount: p._count.replies,
        lastReplyAt,
        unread: !!lastReplyAt && (!threadReadAt || lastReplyAt > threadReadAt),
      };
    })
    .sort((a, b) => {
      const at = a.lastReplyAt ? new Date(a.lastReplyAt).getTime() : 0;
      const bt = b.lastReplyAt ? new Date(b.lastReplyAt).getTime() : 0;
      return bt - at;
    });
}
