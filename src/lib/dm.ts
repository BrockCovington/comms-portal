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
