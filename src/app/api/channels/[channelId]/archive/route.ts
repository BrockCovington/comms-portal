import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";

type RouteContext = { params: Promise<{ channelId: string }> };

async function loadArchivableChannel(channelId: string) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, isDm: true, archivedAt: true },
  });
  if (!channel) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  if (channel.isDm) {
    return { error: NextResponse.json({ error: "Can't archive a direct message" }, { status: 400 }) };
  }
  return { channel };
}

// POST /api/channels/:channelId/archive — freeze new activity in a channel.
// Admin-only, and deliberately not gated by checkChannelAccess: an admin can
// archive a private channel they aren't a member of. Idempotent.
export async function POST(_request: Request, { params }: RouteContext) {
  const { channelId } = await params;
  const access = await requireAdmin();
  if (!access.ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: access.status });
  }

  const loaded = await loadArchivableChannel(channelId);
  if ("error" in loaded) return loaded.error;

  const channel = await prisma.channel.update({
    where: { id: channelId },
    data: { archivedAt: loaded.channel.archivedAt ?? new Date() },
    select: { id: true, archivedAt: true },
  });

  return NextResponse.json({ channel });
}

// DELETE /api/channels/:channelId/archive — unarchive. Admin-only, idempotent.
export async function DELETE(_request: Request, { params }: RouteContext) {
  const { channelId } = await params;
  const access = await requireAdmin();
  if (!access.ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: access.status });
  }

  const loaded = await loadArchivableChannel(channelId);
  if ("error" in loaded) return loaded.error;

  const channel = await prisma.channel.update({
    where: { id: channelId },
    data: { archivedAt: null },
    select: { id: true, archivedAt: true },
  });

  return NextResponse.json({ channel });
}
