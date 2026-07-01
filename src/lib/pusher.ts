import Pusher from "pusher";

// Server-side Pusher client. Uses the SECRET — never import this into a
// client component. It's only used inside API routes (Node runtime).
export const pusherServer = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.PUSHER_CLUSTER!,
  useTLS: true,
});

// All channels are PRIVATE (the "private-" prefix is what tells Pusher to
// require authorization). One Pusher channel per app channel.
export function pusherChannelName(channelId: string): string {
  return `private-channel-${channelId}`;
}

export const PRIVATE_CHANNEL_PREFIX = "private-channel-";
