import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { checkChannelAccess } from "@/lib/authz";
import { toggleReactionSchema } from "@/lib/validation";
import { pusherServer, pusherChannelName } from "@/lib/pusher";

type RouteContext = { params: Promise<{ channelId: string }> };

// POST /api/channels/:channelId/huddle/reaction — a transient emoji reaction
// during a huddle (floats up, disappears). Nothing is written to the
// database — same "no huddle history" boundary as the rest of this feature.
export async function POST(request: Request, { params }: RouteContext) {
  const { channelId } = await params;
  const session = await auth();
  const userId = session?.user?.id ?? null;

  const access = await checkChannelAccess(userId, channelId);
  if (!access.ok) {
    return NextResponse.json({ error: "No access" }, { status: access.status });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = toggleReactionSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const name = session!.user.name ?? session!.user.email ?? "Someone";

  try {
    await pusherServer.trigger(pusherChannelName(channelId), "huddle-reaction", {
      id: userId,
      name,
      emoji: parsed.data.emoji,
    });
  } catch (err) {
    console.error("Huddle reaction broadcast failed:", err);
  }

  return NextResponse.json({ ok: true });
}
