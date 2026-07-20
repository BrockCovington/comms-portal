import type { AppNotification } from "@/hooks/useNotifications";

// DM channel names are a fixed internal debug label (see src/lib/dm.ts),
// never meant for display — so a DM notification never mentions the
// channel by name, unlike a mention/reply in a real channel.
export function describeNotification(n: AppNotification): string {
  // A reminder is self-scheduled, so it reads as a self-contained phrase (the
  // UI shows "⏰ Reminder" rather than an actor name in front of it).
  if (n.type === "REMINDER") {
    return n.isDm ? "about your conversation" : `about a message in #${n.channelName}`;
  }
  if (n.isDm) {
    return n.parentId ? "replied in your conversation" : "sent you a message";
  }
  const where = n.parentId ? `a thread in #${n.channelName}` : `#${n.channelName}`;
  switch (n.type) {
    case "MENTION":
      return `mentioned you in ${where}`;
    case "KEYWORD":
      return `matched a keyword in ${where}`;
    case "CHANNEL":
      return `posted in ${where}`;
    case "THREAD_REPLY":
      return `replied in ${where}`;
    default:
      return `replied in ${where}`;
  }
}
