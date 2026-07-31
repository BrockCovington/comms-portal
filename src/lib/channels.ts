import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { otherMemberLabel } from "@/lib/dm";

export type ChannelWithUnread = {
  id: string;
  name: string;
  isPrivate: boolean;
  isDm: boolean;
  archivedAt: Date | null;
  hasUnread: boolean;
  // Number of unread messages (by others, since this user's last read). 0 for
  // muted channels. hasUnread is exactly unreadCount > 0 — they're derived from
  // the same set, so the bold/dot and the numeric badge never disagree.
  unreadCount: number;
  isStarred: boolean;
  muted: boolean;
  // Custom sidebar section this user filed the channel under (null = default).
  sectionId: string | null;
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

  // Unread counts: one raw query counts, per channel, the messages by *other*
  // people since this user's ChannelRead.lastReadAt (or all of them if never
  // read). Per-channel thresholds vary, so a single groupBy can't express it —
  // hence raw SQL with a LEFT JOIN, backed by the ([channelId, createdAt])
  // index. Starred + prefs are two more cheap lookups.
  const channelIds = channels.map((c) => c.id);
  const [unreadRows, starredRows, prefRows] = channelIds.length
    ? await Promise.all([
        prisma.$queryRaw<{ channelId: string; count: bigint }[]>(Prisma.sql`
          SELECT m."channelId" AS "channelId", COUNT(*) AS "count"
          FROM "Message" m
          LEFT JOIN "ChannelRead" cr
            ON cr."channelId" = m."channelId" AND cr."userId" = ${userId}
          WHERE m."channelId" IN (${Prisma.join(channelIds)})
            AND m."userId" <> ${userId}
            AND (cr."lastReadAt" IS NULL OR m."createdAt" > cr."lastReadAt")
          GROUP BY m."channelId"
        `),
        prisma.starredChannel.findMany({
          where: { userId, channelId: { in: channelIds } },
          select: { channelId: true },
        }),
        // One prefs query gives both mute state and section assignment.
        prisma.channelPreference.findMany({
          where: { userId, channelId: { in: channelIds } },
          select: { channelId: true, muted: true, sectionId: true },
        }),
      ])
    : [[], [], []];
  // COUNT(*) comes back as a bigint; coerce to a JS number.
  const unreadCountByChannel = new Map(unreadRows.map((r) => [r.channelId, Number(r.count)]));
  const starredChannelIds = new Set(starredRows.map((r) => r.channelId));
  const mutedChannelIds = new Set(prefRows.filter((p) => p.muted).map((p) => p.channelId));
  const sectionIdByChannel = new Map(prefRows.map((p) => [p.channelId, p.sectionId]));

  return channels
    .map(({ members, ...c }) => {
      const muted = mutedChannelIds.has(c.id);
      // A muted channel never shows an unread dot/count (Slack behavior).
      const unreadCount = muted ? 0 : unreadCountByChannel.get(c.id) ?? 0;
      return {
        ...c,
        // A DM's stored name is a fixed debug label, never rendered — each
        // viewer sees the other member's name instead.
        name: c.isDm ? otherMemberLabel(members, userId) : c.name,
        hasUnread: unreadCount > 0,
        unreadCount,
        isStarred: starredChannelIds.has(c.id),
        muted,
        sectionId: sectionIdByChannel.get(c.id) ?? null,
      };
    })
    // Regular channels are already alphabetical from the query; DMs need
    // re-sorting since their displayed name (computed above) differs from
    // the fixed `name` column the query sorted on.
    .sort((a, b) => (a.isDm === b.isDm ? a.name.localeCompare(b.name) : a.isDm ? 1 : -1));
}
