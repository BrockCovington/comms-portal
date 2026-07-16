import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/authz";
import { decryptMessage } from "@/lib/crypto";
import { otherMemberLabel } from "@/lib/dm";
import { parseSearchQuery } from "@/lib/searchQuery";

// Bounds the decrypt cost per search to a fixed, predictable amount rather
// than scanning the whole workspace history — see plan doc for why this is
// fine at this app's scale (small internal team) and how it'd need
// revisiting at much larger message volumes.
const SCAN_LIMIT = 2000;
const RESULT_LIMIT = 20;

// Only public channels, or private/DM channels the caller belongs to — same
// rule as the sidebar's channel list and checkChannelAccess().
function accessibleChannelFilter(userId: string): Prisma.ChannelWhereInput {
  return { OR: [{ isPrivate: false, isDm: false }, { members: { some: { userId } } }] };
}

// GET /api/search?q=... — decrypt-and-filter search with an operator language
// (from:/in:/has:/on:/after:/before:), scoped to channels the caller can
// access. Operators filter on unencrypted columns/relations and are pushed
// into the DB query; free text still has to be matched after decrypting each
// candidate, because bodies are encrypted at rest with a random IV (no DB
// text index possible) — this keeps a second plaintext copy from ever
// existing, at the cost of being O(scanned messages) for the text pass.
export async function GET(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const parsed = parseSearchQuery(raw);

  const echo = {
    text: parsed.text,
    from: parsed.from,
    channels: parsed.channels,
    hasLink: parsed.hasLink,
    hasFile: parsed.hasFile,
    after: parsed.after?.toISOString() ?? null,
    before: parsed.before?.toISOString() ?? null,
  };
  const empty = NextResponse.json({ results: [], query: echo });

  // Need either a meaningful free-text term or at least one operator/filter.
  const freeText = parsed.text;
  if (!parsed.hasFilters && freeText.length < 2) return empty;

  // Resolve from:@user — a name/email fragment can match several people; any
  // of them counts. A from: that matches nobody yields no results.
  let userIds: string[] | null = null;
  if (parsed.from.length > 0) {
    const users = await prisma.user.findMany({
      where: {
        OR: parsed.from.flatMap((f) => [
          { name: { contains: f, mode: "insensitive" as const } },
          { email: { contains: f, mode: "insensitive" as const } },
        ]),
      },
      select: { id: true },
    });
    userIds = users.map((u) => u.id);
    if (userIds.length === 0) return empty;
  }

  // Resolve in:#channel — scoped to channels the caller can access, so this
  // can't be used to probe the existence of private channels.
  let channelIds: string[] | null = null;
  if (parsed.channels.length > 0) {
    const chans = await prisma.channel.findMany({
      where: {
        AND: [
          accessibleChannelFilter(userId),
          { OR: parsed.channels.map((c) => ({ name: { contains: c, mode: "insensitive" as const } })) },
        ],
      },
      select: { id: true },
    });
    channelIds = chans.map((c) => c.id);
    if (channelIds.length === 0) return empty;
  }

  const createdAt: Prisma.DateTimeFilter = {};
  if (parsed.after) createdAt.gte = parsed.after;
  if (parsed.before) createdAt.lt = parsed.before;

  const where: Prisma.MessageWhereInput = {
    deletedAt: null,
    channel: accessibleChannelFilter(userId),
    ...(userIds ? { userId: { in: userIds } } : {}),
    ...(channelIds ? { channelId: { in: channelIds } } : {}),
    ...(parsed.hasLink ? { linkPreview: { isNot: null } } : {}),
    ...(parsed.hasFile ? { attachments: { some: {} } } : {}),
    ...(parsed.after || parsed.before ? { createdAt } : {}),
  };

  const candidates = await prisma.message.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: SCAN_LIMIT,
    select: {
      id: true,
      body: true,
      createdAt: true,
      parentId: true,
      channel: {
        select: {
          id: true,
          name: true,
          isDm: true,
          members: { select: { userId: true, user: { select: { name: true, email: true } } } },
        },
      },
      user: { select: { id: true, name: true, image: true } },
    },
  });

  const results = [];
  for (const m of candidates) {
    const body = decryptMessage(m.body);
    // Free text (if any) is AND-matched: every term must appear. With no
    // free text (operator-only search) the DB filter already did the work.
    if (parsed.textTerms.length > 0) {
      const lower = body.toLowerCase();
      if (!parsed.textTerms.every((t) => lower.includes(t))) continue;
    }

    results.push({
      id: m.id,
      channelId: m.channel.id,
      channelName: m.channel.isDm ? otherMemberLabel(m.channel.members, userId) : m.channel.name,
      isDm: m.channel.isDm,
      parentId: m.parentId,
      body,
      createdAt: m.createdAt,
      user: m.user,
    });
    if (results.length >= RESULT_LIMIT) break;
  }

  return NextResponse.json({ results, query: echo });
}
