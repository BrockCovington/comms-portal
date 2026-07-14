import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId, checkChannelAccess } from "@/lib/authz";

type RouteContext = { params: Promise<{ channelId: string }> };

const updateSchema = z.object({
  muted: z.boolean().optional(),
  level: z.enum(["ALL", "MENTIONS", "NONE"]).optional(),
});

// PUT /api/channels/:channelId/notification-preference — set this user's
// per-channel mute and/or notification level. Upsert; absent fields keep
// their current value (defaults: not muted, MENTIONS).
export async function PUT(request: Request, { params }: RouteContext) {
  const { channelId } = await params;
  const userId = await getCurrentUserId();

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
  const parsed = updateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const pref = await prisma.channelPreference.upsert({
    where: { userId_channelId: { userId: userId!, channelId } },
    create: { userId: userId!, channelId, ...parsed.data },
    update: parsed.data,
    select: { muted: true, level: true },
  });

  return NextResponse.json({ muted: pref.muted, level: pref.level });
}
