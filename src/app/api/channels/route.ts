import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/authz";
import { createChannelSchema } from "@/lib/validation";

// GET /api/channels — channels this user can see (public + their private/DM)
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // First-run convenience: make sure there's a #general to land in.
  const total = await prisma.channel.count();
  if (total === 0) {
    await prisma.channel.create({
      data: { name: "general", description: "Company-wide announcements" },
    });
  }

  const channels = await prisma.channel.findMany({
    where: {
      OR: [
        { isPrivate: false, isDm: false },
        { members: { some: { userId } } },
      ],
    },
    select: {
      id: true,
      name: true,
      isPrivate: true,
      isDm: true,
      description: true,
    },
    orderBy: [{ isDm: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({ channels });
}

// POST /api/channels — create a public or private channel
export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createChannelSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { name, description, isPrivate } = parsed.data;

  const channel = await prisma.channel.create({
    data: {
      name,
      description,
      isPrivate,
      createdById: userId,
      // The creator is the first member (matters for private channels).
      members: { create: { userId } },
    },
    select: { id: true, name: true, isPrivate: true, isDm: true },
  });

  return NextResponse.json({ channel }, { status: 201 });
}
