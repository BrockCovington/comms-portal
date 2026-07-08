import { prisma } from "@/lib/prisma";
import { decryptMessage } from "@/lib/crypto";
import { otherMemberLabel } from "@/lib/dm";

export type DmThreadSummary = {
  channelId: string;
  name: string;
  hasUnread: boolean;
  lastMessageAt: Date | null;
  lastMessagePreview: string;
  lastMessageIsMine: boolean;
};

const PREVIEW_LENGTH = 80;

// Powers the DM list column (replaces the normal channel sidebar while
// you're in the DMs section — see Sidebar.tsx). One findFirst per DM
// channel for its most recent message: an N+1, but fine at this app's
// scale (a handful of DMs per user, not thousands) — same tolerance
// already reasoned about for Sidebar's per-channel Pusher subscriptions.
export async function getDmThreadsForUser(userId: string): Promise<DmThreadSummary[]> {
  const channels = await prisma.channel.findMany({
    where: { isDm: true, members: { some: { userId } } },
    select: {
      id: true,
      members: { select: { userId: true, user: { select: { name: true, email: true } } } },
    },
  });
  if (channels.length === 0) return [];

  const channelIds = channels.map((c) => c.id);
  const [lastMessages, readRows] = await Promise.all([
    Promise.all(
      channelIds.map((channelId) =>
        prisma.message.findFirst({
          where: { channelId },
          orderBy: { createdAt: "desc" },
          select: { channelId: true, body: true, deletedAt: true, createdAt: true, userId: true },
        })
      )
    ),
    prisma.channelRead.findMany({
      where: { userId, channelId: { in: channelIds } },
      select: { channelId: true, lastReadAt: true },
    }),
  ]);

  const lastMessageByChannel = new Map(
    lastMessages.filter((m): m is NonNullable<typeof m> => !!m).map((m) => [m.channelId, m])
  );
  const lastReadAtByChannel = new Map(readRows.map((r) => [r.channelId, r.lastReadAt]));

  return channels
    .map((c) => {
      const last = lastMessageByChannel.get(c.id);
      const lastReadAt = lastReadAtByChannel.get(c.id) ?? null;
      return {
        channelId: c.id,
        name: otherMemberLabel(c.members, userId),
        hasUnread: !!last && (!lastReadAt || last.createdAt > lastReadAt),
        lastMessageAt: last?.createdAt ?? null,
        lastMessagePreview: last
          ? last.deletedAt
            ? "This message was deleted"
            : decryptMessage(last.body).slice(0, PREVIEW_LENGTH)
          : "",
        lastMessageIsMine: last?.userId === userId,
      };
    })
    .sort((a, b) => {
      const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bt - at;
    });
}
