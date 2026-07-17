import { NextResponse } from "next/server";
import { RoomServiceClient } from "livekit-server-sdk";
import { getCurrentUserId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { decodeParticipantImage } from "@/lib/huddle";

function liveKitConfig() {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const url = process.env.NEXT_PUBLIC_LIVEKIT_URL;
  if (!apiKey || !apiSecret || !url) return null;
  return { apiKey, apiSecret, url };
}

// GET /api/huddles/active — a snapshot of every channel the caller belongs to
// that has a live huddle right now, as { channelId: participants[] }. The
// sidebar seeds its huddle indicators from this on load, since the live
// "huddle-participant-joined/-left" Pusher events only cover changes that
// happen *after* subscription (a huddle already in progress wouldn't show
// otherwise). Presence comes straight from LiveKit (the source of truth),
// scoped to the user's own channels — same visibility as the sidebar.
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cfg = liveKitConfig();
  if (!cfg) return NextResponse.json({ huddles: {} });

  const memberships = await prisma.channelMember.findMany({
    where: { userId },
    select: { channelId: true },
  });
  if (memberships.length === 0) return NextResponse.json({ huddles: {} });

  // roomName(channelId) = `channel-${channelId}` (see the per-channel huddle route).
  const roomToChannel = new Map(memberships.map((m) => [`channel-${m.channelId}`, m.channelId]));
  const client = new RoomServiceClient(
    cfg.url.replace(/^wss:\/\//, "https://"),
    cfg.apiKey,
    cfg.apiSecret
  );

  const huddles: Record<string, { id: string; name: string | null; image: string | null }[]> = {};
  try {
    // One call finds which of the user's rooms are live; then fetch rosters
    // only for those (usually zero or one) rather than probing every channel.
    const rooms = await client.listRooms(Array.from(roomToChannel.keys()));
    const active = rooms.filter((r) => r.numParticipants > 0);
    await Promise.all(
      active.map(async (room) => {
        const channelId = roomToChannel.get(room.name);
        if (!channelId) return;
        try {
          const info = await client.listParticipants(room.name);
          if (info.length > 0) {
            huddles[channelId] = info.map((p) => ({
              id: p.identity,
              name: p.name || null,
              image: decodeParticipantImage(p.metadata),
            }));
          }
        } catch {
          // Room emptied between the two calls — treat as no huddle.
        }
      })
    );
  } catch (err) {
    console.error("active huddles snapshot failed:", err);
  }

  return NextResponse.json({ huddles });
}
