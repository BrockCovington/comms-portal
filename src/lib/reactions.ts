// Single source of truth for the curated reaction set — imported by both the
// picker UI and the validation schema so the two can never drift apart.
export const REACTION_EMOJIS = ["👍", "❤️", "😂", "🎉", "😮", "👀", "🚀", "✅"] as const;

export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export type ReactionSummary = { emoji: string; count: number; mine: boolean };

// Applies a single reaction-updated delta (from the Pusher broadcast) to a
// message's current reaction list. Shared by useMessages and useThread so
// the add/remove bookkeeping only exists once.
export function applyReactionDelta(
  reactions: ReactionSummary[] | undefined,
  payload: { emoji: string; userId: string; action: "add" | "remove" },
  currentUserId: string
): ReactionSummary[] {
  const list = reactions ? reactions.map((r) => ({ ...r })) : [];
  const index = list.findIndex((r) => r.emoji === payload.emoji);
  const isMine = payload.userId === currentUserId;

  if (payload.action === "add") {
    if (index === -1) {
      list.push({ emoji: payload.emoji, count: 1, mine: isMine });
    } else {
      list[index].count += 1;
      if (isMine) list[index].mine = true;
    }
    return list;
  }

  if (index === -1) return list;
  list[index].count -= 1;
  if (isMine) list[index].mine = false;
  if (list[index].count <= 0) list.splice(index, 1);
  return list;
}
