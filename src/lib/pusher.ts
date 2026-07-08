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

// A presence channel per chat channel — tracks who's currently subscribed
// (viewing that channel), separately from the private channel used for
// message/reaction/etc. events. Same access rule as reading the channel.
export function presenceChannelName(channelId: string): string {
  return `presence-channel-${channelId}`;
}

export const PRESENCE_CHANNEL_PREFIX = "presence-channel-";

// A private channel per USER (not per app channel) — for notifications,
// which need to reach someone regardless of which channel/thread they're
// currently looking at.
export function userChannelName(userId: string): string {
  return `private-user-${userId}`;
}

export const USER_CHANNEL_PREFIX = "private-user-";
