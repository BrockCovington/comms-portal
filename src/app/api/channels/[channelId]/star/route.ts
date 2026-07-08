import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId, checkChannelAccess } from "@/lib/authz";

type RouteContext = { params: Promise<{ channelId: string }> };

// POST /api/channels/:channelId/star — star a channel for quick access.
// Idempotent.
export async function POST(_request: Request, { params }: RouteContext) {
  const { channelId } = await params;
  const userId = await getCurrentUserId();

  const access = await checkChannelAccess(userId, channelId);
  if (!access.ok) {
    return NextResponse.json({ error: "No access" }, { status: access.status });
  }

  await prisma.starredChannel.upsert({
    where: { channelId_userId: { channelId, userId: userId! } },
    update: {},
    create: { channelId, userId: userId! },
  });

  return NextResponse.json({ ok: true });
}

// DELETE /api/channels/:channelId/star — unstar. Idempotent.
export async function DELETE(_request: Request, { params }: RouteContext) {
  const { channelId } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.starredChannel.deleteMany({ where: { channelId, userId } });

  return NextResponse.json({ ok: true });
}
