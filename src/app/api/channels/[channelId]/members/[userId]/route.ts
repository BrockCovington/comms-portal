import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";

type RouteContext = { params: Promise<{ channelId: string; userId: string }> };

// DELETE /api/channels/:channelId/members/:userId — admin override to remove
// a specific member from a channel. Separate from the self-leave DELETE at
// .../members (no admin check there — anyone can leave their own channels);
// this route is 100% admin-gated and, unlike checkChannelAccess-based routes,
// works even on a private channel the admin isn't a member of. Idempotent.
export async function DELETE(_request: Request, { params }: RouteContext) {
  const { channelId, userId } = await params;
  const access = await requireAdmin();
  if (!access.ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: access.status });
  }

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { isDm: true },
  });
  if (!channel) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (channel.isDm) {
    return NextResponse.json({ error: "Can't remove someone from a direct message" }, { status: 400 });
  }

  await prisma.channelMember.deleteMany({ where: { channelId, userId } });

  return NextResponse.json({ ok: true });
}
