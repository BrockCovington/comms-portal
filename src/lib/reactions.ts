// Single source of truth for the curated reaction set — imported by both the
// picker UI and the validation schema so the two can never drift apart.
export const REACTION_EMOJIS = ["👍", "❤️", "😂", "🎉", "😮", "👀", "🚀", "✅"] as const;

export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

// `names` are the display names of everyone who reacted with this emoji, for
// the "who reacted" hover tooltip.
export type ReactionSummary = { emoji: string; count: number; mine: boolean; names: string[] };

// Applies a single reaction-updated delta (from the Pusher broadcast) to a
// message's current reaction list. Shared by useMessages and useThread so
// the add/remove bookkeeping only exists once.
export function applyReactionDelta(
  reactions: ReactionSummary[] | undefined,
  payload: { emoji: string; userId: string; action: "add" | "remove"; name?: string },
  currentUserId: string
): ReactionSummary[] {
  const list = reactions ? reactions.map((r) => ({ ...r, names: [...(r.names ?? [])] })) : [];
  const index = list.findIndex((r) => r.emoji === payload.emoji);
  const isMine = payload.userId === currentUserId;
  const name = payload.name ?? "Someone";

  if (payload.action === "add") {
    if (index === -1) {
      list.push({ emoji: payload.emoji, count: 1, mine: isMine, names: [name] });
    } else {
      list[index].count += 1;
      list[index].names.push(name);
      if (isMine) list[index].mine = true;
    }
    return list;
  }

  if (index === -1) return list;
  list[index].count -= 1;
  const ni = list[index].names.indexOf(name);
  if (ni !== -1) list[index].names.splice(ni, 1);
  if (isMine) list[index].mine = false;
  if (list[index].count <= 0) list.splice(index, 1);
  return list;
}

// Aggregates raw reaction rows into per-message summaries (with reactor names).
// Shared by the channel-messages and thread routes so the shape never drifts.
export type ReactionRow = {
  messageId: string;
  emoji: string;
  userId: string;
  user: { name: string | null; email: string };
};

export function buildReactionSummaries(
  rows: ReactionRow[],
  currentUserId: string | null
): Map<string, ReactionSummary[]> {
  const byMessage = new Map<string, ReactionSummary[]>();
  for (const r of rows) {
    const list = byMessage.get(r.messageId) ?? [];
    const name = r.user.name ?? r.user.email;
    const entry = list.find((e) => e.emoji === r.emoji);
    if (entry) {
      entry.count += 1;
      entry.names.push(name);
      if (r.userId === currentUserId) entry.mine = true;
    } else {
      list.push({ emoji: r.emoji, count: 1, mine: r.userId === currentUserId, names: [name] });
    }
    byMessage.set(r.messageId, list);
  }
  return byMessage;
}
