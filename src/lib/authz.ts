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

/**
 * Gate for the workspace-wide ADMIN role (see prisma/schema.prisma's Role
 * enum) — independent of channel membership, unlike checkChannelAccess.
 * Sessions use the database strategy, so this always reflects the user's
 * current role, not a stale JWT claim.
 */
export async function requireAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; status: 401 | 403 }
> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, status: 401 };
  if (session.user.role !== "ADMIN") return { ok: false, status: 403 };
  return { ok: true, userId: session.user.id };
}

export type ChannelAccess =
  | {
      ok: true;
      channel: {
        id: string;
        name: string;
        isPrivate: boolean;
        isDm: boolean;
        archivedAt: Date | null;
      };
    }
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
    select: { id: true, name: true, isPrivate: true, isDm: true, archivedAt: true },
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
