import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/authz";
import { pusherServer, WORKSPACE_PRESENCE_CHANNEL } from "@/lib/pusher";

// POST /api/presence — broadcast this user's active/away state to the
// workspace presence channel. "Online" membership is handled by Pusher's
// presence bookkeeping; this only relays the away flag (tab hidden/idle) so
// others can dim the dot. Server-relayed (not a Pusher client event) so it
// works without enabling client events on the Pusher app.
export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let away = false;
  try {
    const body = (await request.json()) as { away?: unknown };
    away = body.away === true;
  } catch {
    // Default to active on a bad/empty body.
  }

  await pusherServer
    .trigger(WORKSPACE_PRESENCE_CHANNEL, "presence-changed", { userId, away })
    .catch(() => {});
  return NextResponse.json({ ok: true });
}
