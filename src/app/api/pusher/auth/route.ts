import { NextResponse } from "next/server";
import {
  pusherServer,
  PRIVATE_CHANNEL_PREFIX,
  PRESENCE_CHANNEL_PREFIX,
  USER_CHANNEL_PREFIX,
} from "@/lib/pusher";
import { auth } from "@/auth";
import { checkChannelAccess } from "@/lib/authz";

// Pusher calls this before letting a browser subscribe to a private or
// presence channel. We only authorize the subscription if the user passes
// the SAME access check used everywhere else, so real-time can't bypass our
// authorization model.
export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // pusher-js sends this as form-encoded: socket_id=...&channel_name=...
  const body = await request.text();
  const params = new URLSearchParams(body);
  const socketId = params.get("socket_id");
  const channel = params.get("channel_name");

  if (!socketId || !channel) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  // A user channel isn't a channel-membership rule — it's "you can only
  // listen to your own notification stream" — so it's handled entirely
  // separately from the checkChannelAccess-based rule below.
  if (channel.startsWith(USER_CHANNEL_PREFIX)) {
    const targetUserId = channel.slice(USER_CHANNEL_PREFIX.length);
    if (targetUserId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json(pusherServer.authorizeChannel(socketId, channel));
  }

  const isPresence = channel.startsWith(PRESENCE_CHANNEL_PREFIX);
  const isPrivate = channel.startsWith(PRIVATE_CHANNEL_PREFIX);
  if (!isPresence && !isPrivate) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const channelId = channel.slice(isPresence ? PRESENCE_CHANNEL_PREFIX.length : PRIVATE_CHANNEL_PREFIX.length);

  const access = await checkChannelAccess(userId, channelId);
  if (!access.ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Presence channels need user_id/user_info in the auth response — that's
  // what populates channel.members with actual display data on the client.
  const authResponse = isPresence
    ? pusherServer.authorizeChannel(socketId, channel, {
        user_id: userId,
        user_info: { name: session?.user?.name ?? null, image: session?.user?.image ?? null },
      })
    : pusherServer.authorizeChannel(socketId, channel);

  return NextResponse.json(authResponse);
}
