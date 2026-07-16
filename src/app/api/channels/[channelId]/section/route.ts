import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId, checkChannelAccess } from "@/lib/authz";

type RouteContext = { params: Promise<{ channelId: string }> };

// POST /api/channels/:channelId/section — file this channel under a custom
// sidebar section for the current user (or clear it with sectionId: null).
// Purely personal: it upserts the caller's own ChannelPreference row.
export async function POST(request: Request, { params }: RouteContext) {
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

  const raw = (json as { sectionId?: unknown }).sectionId;
  const sectionId = raw == null ? null : String(raw);

  // Only allow assigning to a section the caller actually owns — never file a
  // channel into someone else's section id.
  if (sectionId) {
    const section = await prisma.channelSection.findFirst({
      where: { id: sectionId, userId: userId! },
      select: { id: true },
    });
    if (!section) return NextResponse.json({ error: "Section not found" }, { status: 404 });
  }

  await prisma.channelPreference.upsert({
    where: { userId_channelId: { userId: userId!, channelId } },
    update: { sectionId },
    create: { userId: userId!, channelId, sectionId },
  });

  return NextResponse.json({ ok: true, sectionId });
}
