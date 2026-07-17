import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId, checkChannelAccess } from "@/lib/authz";
import { decryptMessage } from "@/lib/crypto";
import { deliverMessage } from "@/lib/deliver";

type RouteContext = { params: Promise<{ id: string }> };

// POST /api/workflows/:id/run — fire a workflow immediately, once, without
// touching its recurring schedule. Creator or admin only. The post is authored
// by the workflow's creator (same as an automatic fire), so their channel
// access is what's checked here.
export async function POST(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const wf = await prisma.workflow.findUnique({
    where: { id },
    select: { channelId: true, createdById: true, body: true },
  });
  if (!wf) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (wf.createdById !== userId) {
    const me = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (me?.role !== "ADMIN") {
      return NextResponse.json({ error: "Only the creator or an admin can run this workflow" }, { status: 403 });
    }
  }

  // The post fires as the workflow's author — verify *they* can still post.
  const access = await checkChannelAccess(wf.createdById, wf.channelId);
  if (!access.ok) return NextResponse.json({ error: "The workflow's author can no longer post to that channel" }, { status: 400 });
  if (access.channel.archivedAt) return NextResponse.json({ error: "That channel is archived" }, { status: 400 });

  await deliverMessage({
    channelId: wf.channelId,
    userId: wf.createdById,
    body: decryptMessage(wf.body),
    channel: { name: access.channel.name, isDm: access.channel.isDm },
  });

  await prisma.workflow.update({
    where: { id },
    data: { lastRunAt: new Date(), runCount: { increment: 1 } },
  });
  return NextResponse.json({ ok: true });
}
