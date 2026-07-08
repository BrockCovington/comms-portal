import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId, checkChannelAccess } from "@/lib/authz";
import { pusherServer, presenceChannelName } from "@/lib/pusher";

type RouteContext = { params: Promise<{ channelId: string }> };

// POST /api/channels/:channelId/typing — fire a "someone is typing" ping.
// Purely ephemeral (never persisted) — the one broadcast in this app that
// doesn't correspond to a database write of its own.
export async function POST(_request: Request, { params }: RouteContext) {
  const { channelId } = await params;
  const userId = await getCurrentUserId();

  const access = await checkChannelAccess(userId, channelId);
  if (!access.ok) {
    return NextResponse.json({ error: "No access" }, { status: access.status });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId! },
    select: { name: true, email: true },
  });

  try {
    await pusherServer.trigger(presenceChannelName(channelId), "typing", {
      userId,
      name: user?.name ?? user?.email ?? "Someone",
    });
  } catch (err) {
    console.error("Pusher broadcast failed:", err);
  }

  return NextResponse.json({ ok: true });
}
