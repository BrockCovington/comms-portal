import type { AppNotification } from "@/hooks/useNotifications";

// DM channel names are a fixed internal debug label (see src/lib/dm.ts),
// never meant for display — so a DM notification never mentions the
// channel by name, unlike a mention/reply in a real channel.
export function describeNotification(n: AppNotification): string {
  if (n.isDm) {
    return n.parentId ? "replied in your conversation" : "sent you a message";
  }
  const where = n.parentId ? `a thread in #${n.channelName}` : `#${n.channelName}`;
  return n.type === "MENTION" ? `mentioned you in ${where}` : `replied in ${where}`;
}
