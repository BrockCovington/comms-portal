import { NextResponse } from "next/server";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { auth } from "@/auth";
import { checkChannelAccess } from "@/lib/authz";
import { pusherServer, pusherChannelName } from "@/lib/pusher";
import { encodeParticipantMetadata, decodeParticipantImage } from "@/lib/huddle";

type RouteContext = { params: Promise<{ channelId: string }> };

function roomName(channelId: string): string {
  return `channel-${channelId}`;
}

function requireLiveKitConfig() {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const url = process.env.NEXT_PUBLIC_LIVEKIT_URL;
  if (!apiKey || !apiSecret || !url) return null;
  return { apiKey, apiSecret, url };
}

// GET /api/channels/:channelId/huddle — the current roster, straight from
// LiveKit (the actual source of truth for who's connected), not from any
// Pusher presence bookkeeping. This is what lets a bystander who opens the
// channel mid-huddle see who's already in it, not just future join/leave
// events (see the POST/DELETE handlers below for those).
export async function GET(_request: Request, { params }: RouteContext) {
  const { channelId } = await params;
  const userId = await auth().then((s) => s?.user?.id ?? null);

  const access = await checkChannelAccess(userId, channelId);
  if (!access.ok) {
    return NextResponse.json({ error: "No access" }, { status: access.status });
  }

  const config = requireLiveKitConfig();
  if (!config) {
    return NextResponse.json({ participants: [] });
  }

  const client = new RoomServiceClient(
    config.url.replace(/^wss:\/\//, "https://"),
    config.apiKey,
    config.apiSecret
  );

  try {
    const info = await client.listParticipants(roomName(channelId));
    return NextResponse.json({
      participants: info.map((p) => ({
        id: p.identity,
        name: p.name || null,
        image: decodeParticipantImage(p.metadata),
      })),
    });
  } catch {
    // No active room for this channel yet — that's just "nobody's in a huddle."
    return NextResponse.json({ participants: [] });
  }
}

// POST /api/channels/:channelId/huddle — join: mint a LiveKit token, then
// tell everyone else currently viewing the channel (over the same private
// channel new-message/reactions already ride) that this person joined.
export async function POST(_request: Request, { params }: RouteContext) {
  const { channelId } = await params;
  const session = await auth();
  const userId = session?.user?.id ?? null;

  const access = await checkChannelAccess(userId, channelId);
  if (!access.ok) {
    return NextResponse.json({ error: "No access" }, { status: access.status });
  }
  if (access.channel.archivedAt) {
    return NextResponse.json({ error: "This channel is archived" }, { status: 400 });
  }

  const config = requireLiveKitConfig();
  if (!config) {
    return NextResponse.json(
      { error: "Huddles aren't configured on this server yet." },
      { status: 503 }
    );
  }

  const name = session!.user.name ?? session!.user.email ?? "Someone";
  const image = session!.user.image ?? null;
  const token = new AccessToken(config.apiKey, config.apiSecret, {
    identity: userId!,
    name,
    metadata: encodeParticipantMetadata(image),
  });
  token.addGrant({ room: roomName(channelId), roomJoin: true, canPublish: true, canSubscribe: true });

  try {
    await pusherServer.trigger(pusherChannelName(channelId), "huddle-participant-joined", {
      id: userId,
      name,
      image,
    });
  } catch (err) {
    console.error("Huddle broadcast failed:", err);
  }

  return NextResponse.json({ token: await token.toJwt(), url: config.url });
}

// DELETE /api/channels/:channelId/huddle — leave: tell everyone else this
// person left. The actual LiveKit disconnect happens client-side; this is
// purely the bystander-facing announcement (LiveKit's own room state is
// still the source of truth on next GET, so a missed DELETE — e.g. a
// crashed tab — only leaves the roster briefly stale, not permanently wrong).
export async function DELETE(_request: Request, { params }: RouteContext) {
  const { channelId } = await params;
  const userId = await auth().then((s) => s?.user?.id ?? null);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await pusherServer.trigger(pusherChannelName(channelId), "huddle-participant-left", {
      id: userId,
    });
  } catch (err) {
    console.error("Huddle broadcast failed:", err);
  }

  return NextResponse.json({ ok: true });
}
