import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId, checkChannelAccess } from "@/lib/authz";
import { addChannelMemberSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ channelId: string }> };

// GET /api/channels/:channelId/members
export async function GET(_request: Request, { params }: RouteContext) {
  const { channelId } = await params;
  const userId = await getCurrentUserId();

  const access = await checkChannelAccess(userId, channelId);
  if (!access.ok) {
    return NextResponse.json({ error: "No access" }, { status: access.status });
  }

  const members = await prisma.channelMember.findMany({
    where: { channelId },
    select: { userId: true, user: { select: { id: true, name: true, email: true, image: true, statusEmoji: true, statusText: true, statusExpiresAt: true } } },
  });

  return NextResponse.json({ members });
}

// POST /api/channels/:channelId/members — add someone to the channel.
//
// Reuses checkChannelAccess as the permission check rather than requiring the
// ADMIN role: for a private channel that already requires the caller to be a
// member, so "can view this channel" and "can add someone to it" are the same
// rule. Public channels already allow any signed-in user to post, so any
// signed-in user can add someone too. (Admins have a separate, stronger power
// — removing a member from any channel regardless of their own membership —
// at DELETE /api/channels/[channelId]/members/[userId].)
export async function POST(request: Request, { params }: RouteContext) {
  const { channelId } = await params;
  const userId = await getCurrentUserId();

  const access = await checkChannelAccess(userId, channelId);
  if (!access.ok) {
    return NextResponse.json({ error: "No access" }, { status: access.status });
  }
  if (access.channel.isDm) {
    return NextResponse.json({ error: "Can't add members to a direct message" }, { status: 400 });
  }
  if (access.channel.archivedAt) {
    return NextResponse.json({ error: "This channel is archived" }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = addChannelMemberSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
    select: { id: true, name: true, email: true, image: true, statusEmoji: true, statusText: true, statusExpiresAt: true },
  });
  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  await prisma.channelMember.upsert({
    where: { channelId_userId: { channelId, userId: targetUser.id } },
    update: {},
    create: { channelId, userId: targetUser.id },
  });

  return NextResponse.json({ member: { userId: targetUser.id, user: targetUser } });
}

// DELETE /api/channels/:channelId/members — leave the channel (self only;
// there's no "remove someone else" here). Idempotent if you weren't a
// member to begin with.
export async function DELETE(_request: Request, { params }: RouteContext) {
  const { channelId } = await params;
  const userId = await getCurrentUserId();

  const access = await checkChannelAccess(userId, channelId);
  if (!access.ok) {
    return NextResponse.json({ error: "No access" }, { status: access.status });
  }
  if (access.channel.isDm) {
    return NextResponse.json({ error: "Can't leave a direct message" }, { status: 400 });
  }

  await prisma.channelMember.deleteMany({ where: { channelId, userId: userId! } });

  return NextResponse.json({ ok: true });
}
