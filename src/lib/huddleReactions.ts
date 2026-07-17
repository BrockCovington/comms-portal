import { prisma } from "@/lib/prisma";
import { REACTION_EMOJIS } from "@/lib/reactions";

// The user's chosen huddle quick-reactions, or the shared default set when
// they haven't customized it. Always returns a non-empty list.
export async function getHuddleReactions(userId: string): Promise<string[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { huddleReactions: true },
  });
  return user && user.huddleReactions.length > 0 ? user.huddleReactions : [...REACTION_EMOJIS];
}
