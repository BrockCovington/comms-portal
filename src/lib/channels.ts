import { prisma } from "@/lib/prisma";
import { otherMemberLabel } from "@/lib/dm";

export type ChannelWithUnread = {
  id: string;
  name: string;
  isPrivate: boolean;
  isDm: boolean;
  archivedAt: Date | null;
  hasUnread: boolean;
  isStarred: boolean;
  muted: boolean;
};

// Shared by the sidebar (src/app/(app)/layout.tsx) and the /unreads page —
// both need the exact same "channels I'm in, with unread + starred state"
// computation, so it lives in one place rather than being copied.
//
// The sidebar shows exactly what you're a member of — for every channel
// type uniformly, including public ones. This doesn't change who can
// *access* a public channel (still anyone, see checkChannelAccess), only
// whether it's pinned in your sidebar; joining/leaving is what changes
// this set (see /api/channels/[channelId]/join and the DELETE handler on
// .../members).
export async function getChannelsWithUnread(userId: string): Promise<ChannelWithUnread[]> {
  const channels = await prisma.channel.findMany({
    where: { members: { some: { userId } } },
    select: {
      id: true,
      name: true,
      isPrivate: true,
      isDm: true,
      archivedAt: true,
      members: {
        select: { userId: true, user: { select: { name: true, email: true } } },
      },
    },
    orderBy: [{ isDm: "asc" }, { name: "asc" }],
  });

  // Unread state: one extra grouped query for the latest message per visible
  // channel, one for this user's read receipts, diffed in memory — same
  // "grouped query, not N+1" pattern used for thread previews. Starred
  // state is a third, similarly cheap lookup.
  const channelIds = channels.map((c) => c.id);
  const [lastMessageRows, readRows, starredRows, mutedRows] = channelIds.length
    ? await Promise.all([
        prisma.message.groupBy({
          by: ["channelId"],
          where: { channelId: { in: channelIds } },
          _max: { createdAt: true },
        }),
        prisma.channelRead.findMany({
          where: { userId, channelId: { in: channelIds } },
          select: { channelId: true, lastReadAt: true },
        }),
        prisma.starredChannel.findMany({
          where: { userId, channelId: { in: channelIds } },
          select: { channelId: true },
        }),
        prisma.channelPreference.findMany({
          where: { userId, channelId: { in: channelIds }, muted: true },
          select: { channelId: true },
        }),
      ])
    : [[], [], [], []];
  const lastMessageAtByChannel = new Map(
    lastMessageRows.map((r) => [r.channelId, r._max.createdAt])
  );
  const lastReadAtByChannel = new Map(readRows.map((r) => [r.channelId, r.lastReadAt]));
  const starredChannelIds = new Set(starredRows.map((r) => r.channelId));
  const mutedChannelIds = new Set(mutedRows.map((r) => r.channelId));

  return channels
    .map(({ members, ...c }) => {
      const lastMessageAt = lastMessageAtByChannel.get(c.id);
      const lastReadAt = lastReadAtByChannel.get(c.id);
      const muted = mutedChannelIds.has(c.id);
      return {
        ...c,
        // A DM's stored name is a fixed debug label, never rendered — each
        // viewer sees the other member's name instead.
        name: c.isDm ? otherMemberLabel(members, userId) : c.name,
        // A muted channel never shows an unread dot (Slack behavior).
        hasUnread: !muted && !!lastMessageAt && (!lastReadAt || lastMessageAt > lastReadAt),
        isStarred: starredChannelIds.has(c.id),
        muted,
      };
    })
    // Regular channels are already alphabetical from the query; DMs need
    // re-sorting since their displayed name (computed above) differs from
    // the fixed `name` column the query sorted on.
    .sort((a, b) => (a.isDm === b.isDm ? a.name.localeCompare(b.name) : a.isDm ? 1 : -1));
}
