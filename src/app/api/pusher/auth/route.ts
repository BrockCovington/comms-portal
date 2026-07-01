import { NextResponse } from "next/server";
import { pusherServer, PRIVATE_CHANNEL_PREFIX } from "@/lib/pusher";
import { getCurrentUserId, checkChannelAccess } from "@/lib/authz";

// Pusher calls this before letting a browser subscribe to a private channel.
// We only authorize the subscription if the user passes the SAME access check
// used everywhere else, so real-time can't bypass our authorization model.
export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // pusher-js sends this as form-encoded: socket_id=...&channel_name=...
  const body = await request.text();
  const params = new URLSearchParams(body);
  const socketId = params.get("socket_id");
  const channel = params.get("channel_name");

  if (!socketId || !channel || !channel.startsWith(PRIVATE_CHANNEL_PREFIX)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const channelId = channel.slice(PRIVATE_CHANNEL_PREFIX.length);

  const access = await checkChannelAccess(userId, channelId);
  if (!access.ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // authorizeChannel returns { auth: "<key>:<signature>" } which Pusher needs.
  const authResponse = pusherServer.authorizeChannel(socketId, channel);
  return NextResponse.json(authResponse);
}
