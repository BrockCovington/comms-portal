import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId, checkChannelAccess } from "@/lib/authz";
import { postMessageSchema } from "@/lib/validation";
import { encryptMessage, decryptMessage } from "@/lib/crypto";

type RouteContext = { params: Promise<{ channelId: string }> };

// GET /api/channels/:channelId/messages — newest 100, oldest first
export async function GET(_request: Request, { params }: RouteContext) {
  const { channelId } = await params;
  const userId = await getCurrentUserId();

  const access = await checkChannelAccess(userId, channelId);
  if (!access.ok) {
    return NextResponse.json({ error: "No access" }, { status: access.status });
  }

  const rows = await prisma.message.findMany({
    where: { channelId, parentId: null },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      body: true,
      createdAt: true,
      editedAt: true,
      user: { select: { id: true, name: true, image: true } },
    },
  });

  const messages = rows
    .reverse()
    .map((m) => ({ ...m, body: decryptMessage(m.body) }));

  return NextResponse.json({ messages });
}

// POST /api/channels/:channelId/messages — send a message
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

  const parsed = postMessageSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const created = await prisma.message.create({
    data: {
      channelId,
      userId: userId!,
      parentId: parsed.data.parentId ?? null,
      body: encryptMessage(parsed.data.body), // encrypt before it touches the DB
    },
    select: {
      id: true,
      createdAt: true,
      editedAt: true,
      user: { select: { id: true, name: true, image: true } },
    },
  });

  // Return the plaintext we just stored (don't round-trip through the DB).
  return NextResponse.json(
    { message: { ...created, body: parsed.data.body } },
    { status: 201 }
  );
}
