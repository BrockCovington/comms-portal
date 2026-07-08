import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId, checkChannelAccess } from "@/lib/authz";
import { encryptMessage, decryptMessage } from "@/lib/crypto";

type RouteContext = { params: Promise<{ channelId: string }> };

// GET /api/channels/:channelId/draft — this user's saved draft for this
// channel, if any (used by the composer to prefill on mount).
export async function GET(_request: Request, { params }: RouteContext) {
  const { channelId } = await params;
  const userId = await getCurrentUserId();

  const access = await checkChannelAccess(userId, channelId);
  if (!access.ok) {
    return NextResponse.json({ error: "No access" }, { status: access.status });
  }

  const draft = await prisma.draft.findUnique({
    where: { channelId_userId: { channelId, userId: userId! } },
    select: { body: true },
  });

  return NextResponse.json({ body: draft ? decryptMessage(draft.body) : "" });
}

// PUT /api/channels/:channelId/draft — upsert this user's unsent composer
// text for this channel (root composer only, not thread replies). Encrypted
// the same way messages are — a draft is message content that just hasn't
// been sent yet, so it gets the same at-rest guarantee.
export async function PUT(request: Request, { params }: RouteContext) {
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

  const body = typeof (json as { body?: unknown })?.body === "string" ? (json as { body: string }).body : "";
  if (!body.trim()) {
    // An emptied-out draft is the same as no draft — clean it up rather
    // than leaving an empty row behind.
    await prisma.draft.deleteMany({ where: { channelId, userId: userId! } });
    return NextResponse.json({ ok: true });
  }

  await prisma.draft.upsert({
    where: { channelId_userId: { channelId, userId: userId! } },
    update: { body: encryptMessage(body) },
    create: { channelId, userId: userId!, body: encryptMessage(body) },
  });

  return NextResponse.json({ ok: true });
}

// DELETE /api/channels/:channelId/draft — clear the draft (called after a
// successful send). Idempotent.
export async function DELETE(_request: Request, { params }: RouteContext) {
  const { channelId } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.draft.deleteMany({ where: { channelId, userId } });
  return NextResponse.json({ ok: true });
}
