import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId, checkChannelAccess } from "@/lib/authz";
import { pusherServer, pusherChannelName } from "@/lib/pusher";
import { reactionTokenSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ channelId: string }> };

const MAX_TITLE = 80;
const MAX_BOOKMARKS = 30;

function serialize(b: { id: string; title: string; url: string; emoji: string | null; position: number; createdById: string }) {
  return { id: b.id, title: b.title, url: b.url, emoji: b.emoji, position: b.position, createdById: b.createdById };
}

// GET /api/channels/:channelId/bookmarks — the channel's bookmark bar.
export async function GET(_request: Request, { params }: RouteContext) {
  const { channelId } = await params;
  const userId = await getCurrentUserId();
  const access = await checkChannelAccess(userId, channelId);
  if (!access.ok) return NextResponse.json({ error: "No access" }, { status: access.status });

  const bookmarks = await prisma.channelBookmark.findMany({
    where: { channelId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true, title: true, url: true, emoji: true, position: true, createdById: true },
  });
  return NextResponse.json({ bookmarks: bookmarks.map(serialize) });
}

// POST /api/channels/:channelId/bookmarks — add a bookmark. Any member can add.
export async function POST(request: Request, { params }: RouteContext) {
  const { channelId } = await params;
  const userId = await getCurrentUserId();
  const access = await checkChannelAccess(userId, channelId);
  if (!access.ok) return NextResponse.json({ error: "No access" }, { status: access.status });
  if (access.channel.archivedAt) return NextResponse.json({ error: "This channel is archived" }, { status: 400 });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const b = json as { title?: unknown; url?: unknown; emoji?: unknown };

  // Normalize + validate the URL (http/https only; default to https://).
  let raw = String(b.url ?? "").trim();
  if (!raw) return NextResponse.json({ error: "A link is required" }, { status: 400 });
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  let url: string;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("bad protocol");
    url = parsed.toString();
  } catch {
    return NextResponse.json({ error: "Enter a valid link" }, { status: 400 });
  }

  const title = String(b.title ?? "").trim().slice(0, MAX_TITLE) || new URL(url).hostname;

  // Optional leading emoji — reuse the reaction token rule (unicode or :name:).
  let emoji: string | null = null;
  if (b.emoji != null && String(b.emoji).trim()) {
    const parsedEmoji = reactionTokenSchema.safeParse(String(b.emoji).trim());
    if (parsedEmoji.success) emoji = parsedEmoji.data;
  }

  const count = await prisma.channelBookmark.count({ where: { channelId } });
  if (count >= MAX_BOOKMARKS) {
    return NextResponse.json({ error: `A channel can have up to ${MAX_BOOKMARKS} bookmarks` }, { status: 400 });
  }

  const created = await prisma.channelBookmark.create({
    data: { channelId, title, url, emoji, createdById: userId!, position: count },
    select: { id: true, title: true, url: true, emoji: true, position: true, createdById: true },
  });

  await pusherServer
    .trigger(pusherChannelName(channelId), "bookmark-updated", { channelId })
    .catch(() => {});

  return NextResponse.json({ bookmark: serialize(created) }, { status: 201 });
}
