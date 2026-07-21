import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId, checkChannelAccess } from "@/lib/authz";
import { pusherServer, pusherChannelName } from "@/lib/pusher";

type RouteContext = { params: Promise<{ channelId: string; bookmarkId: string }> };

// DELETE /api/channels/:channelId/bookmarks/:bookmarkId — remove a bookmark.
// The creator or a workspace admin can remove it.
export async function DELETE(_request: Request, { params }: RouteContext) {
  const { channelId, bookmarkId } = await params;
  const userId = await getCurrentUserId();
  const access = await checkChannelAccess(userId, channelId);
  if (!access.ok) return NextResponse.json({ error: "No access" }, { status: access.status });

  const bookmark = await prisma.channelBookmark.findFirst({
    where: { id: bookmarkId, channelId },
    select: { id: true, createdById: true },
  });
  if (!bookmark) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (bookmark.createdById !== userId) {
    const me = await prisma.user.findUnique({ where: { id: userId! }, select: { role: true } });
    if (me?.role !== "ADMIN") {
      return NextResponse.json({ error: "Only the person who added it or an admin can remove it" }, { status: 403 });
    }
  }

  await prisma.channelBookmark.delete({ where: { id: bookmarkId } });
  await pusherServer
    .trigger(pusherChannelName(channelId), "bookmark-updated", { channelId })
    .catch(() => {});
  return NextResponse.json({ ok: true });
}
