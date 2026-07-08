import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/authz";
import { startDmSchema } from "@/lib/validation";

// POST /api/dms — find-or-create the 1:1 DM channel with another user.
// Never creates a duplicate: `dmKey` (sorted "userIdA:userIdB") is
// unique-indexed, so a race between two concurrent requests for the same
// pair is resolved by catching the unique-constraint violation and
// re-reading, rather than by a find-then-create check with a race window.
export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = startDmSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const otherUserId = parsed.data.userId;

  if (otherUserId === userId) {
    return NextResponse.json({ error: "Can't start a DM with yourself" }, { status: 400 });
  }

  const otherUser = await prisma.user.findUnique({
    where: { id: otherUserId },
    select: { id: true, name: true, email: true },
  });
  if (!otherUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const dmKey = [userId, otherUserId].sort().join(":");

  let channel = await prisma.channel.findUnique({ where: { dmKey }, select: { id: true } });
  if (!channel) {
    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });
    try {
      channel = await prisma.channel.create({
        data: {
          isDm: true,
          dmKey,
          // Debug/admin label only — never rendered. Display name is always
          // computed per viewer from the other ChannelMember (see lib/dm.ts).
          name: `${me?.name ?? me?.email} & ${otherUser.name ?? otherUser.email}`,
          members: { create: [{ userId }, { userId: otherUserId }] },
        },
        select: { id: true },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        channel = await prisma.channel.findUniqueOrThrow({ where: { dmKey }, select: { id: true } });
      } else {
        throw err;
      }
    }
  }

  return NextResponse.json({ channel });
}
