import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Returns the current authenticated user's id, or null if not signed in.
 * Use this at the top of every API route and server action.
 */
export async function getCurrentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

export type ChannelAccess =
  | { ok: true; channel: { id: string; name: string; isPrivate: boolean; isDm: boolean } }
  | { ok: false; status: 401 | 403 | 404 };

/**
 * Central access rule for a channel:
 *   - public channel  -> any signed-in org user may read/post
 *   - private channel -> only members may read/post
 *   - DM              -> only members may read/post
 *
 * Every route that touches channel content should call this. Never trust a
 * channelId from the client without running it through here first.
 */
export async function checkChannelAccess(
  userId: string | null,
  channelId: string
): Promise<ChannelAccess> {
  if (!userId) return { ok: false, status: 401 };

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, name: true, isPrivate: true, isDm: true },
  });
  if (!channel) return { ok: false, status: 404 };

  if (!channel.isPrivate && !channel.isDm) {
    return { ok: true, channel };
  }

  const membership = await prisma.channelMember.findUnique({
    where: { channelId_userId: { channelId, userId } },
    select: { id: true },
  });
  if (!membership) return { ok: false, status: 403 };

  return { ok: true, channel };
}
