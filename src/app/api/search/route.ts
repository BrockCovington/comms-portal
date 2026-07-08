import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/authz";
import { decryptMessage } from "@/lib/crypto";
import { otherMemberLabel } from "@/lib/dm";

// Bounds the decrypt cost per search to a fixed, predictable amount rather
// than scanning the whole workspace history — see plan doc for why this is
// fine at this app's scale (small internal team) and how it'd need
// revisiting at much larger message volumes.
const SCAN_LIMIT = 2000;
const RESULT_LIMIT = 20;

// GET /api/search?q=... — decrypt-and-filter search, scoped to channels the
// caller can actually access (same rule as the sidebar's channel list).
// Message bodies are encrypted at rest, so there's no DB text index to lean
// on; this keeps a second, separately-secured plaintext copy from ever
// existing, at the cost of being O(scanned messages) per search.
export async function GET(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ results: [] });

  const candidates = await prisma.message.findMany({
    where: {
      deletedAt: null,
      channel: {
        OR: [{ isPrivate: false, isDm: false }, { members: { some: { userId } } }],
      },
    },
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

  const needle = q.toLowerCase();
  const results = [];
  for (const m of candidates) {
    const body = decryptMessage(m.body);
    if (!body.toLowerCase().includes(needle)) continue;

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

  return NextResponse.json({ results });
}
