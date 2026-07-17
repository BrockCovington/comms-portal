// A DM channel's stored `name` is a fixed debug label set once at creation
// and never rendered — each viewer needs to see the *other* person's name,
// so it's computed here instead, wherever a DM channel is displayed.
export function otherMemberLabel(
  members: { userId: string; user: { name: string | null; email: string } }[],
  currentUserId: string
): string {
  const other = members.find((m) => m.userId !== currentUserId);
  return other?.user.name ?? other?.user.email ?? "Direct message";
}

// Companion to otherMemberLabel: the other participant's avatar, so a DM row
// shows their picture rather than an initial of their name.
export function otherMemberImage(
  members: { userId: string; user: { image: string | null } }[],
  currentUserId: string
): string | null {
  const other = members.find((m) => m.userId !== currentUserId);
  return other?.user.image ?? null;
}

// The other participant's custom status, for the DM list. Resolved to inactive
// once expired (same rule as the status API).
export function otherMemberStatus(
  members: {
    userId: string;
    user: { statusEmoji: string | null; statusText: string | null; statusExpiresAt: Date | null };
  }[],
  currentUserId: string
): { emoji: string | null; text: string | null } {
  const other = members.find((m) => m.userId !== currentUserId)?.user;
  if (!other?.statusEmoji) return { emoji: null, text: null };
  if (other.statusExpiresAt && other.statusExpiresAt.getTime() <= Date.now()) {
    return { emoji: null, text: null };
  }
  return { emoji: other.statusEmoji, text: other.statusText };
}
