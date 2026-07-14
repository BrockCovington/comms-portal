import { NextResponse } from "next/server";
import { del, get } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/authz";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/emoji/:id — stream a custom emoji's image bytes. The store is
// private, so (like /api/files/:id) the blob is fetched server-side with the
// token and streamed back; the raw Blob URL never reaches the browser. Only
// requires a signed-in user — custom emoji are workspace-wide, not
// channel-scoped, so there's no per-channel check.
export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const emoji = await prisma.customEmoji.findUnique({
    where: { id },
    select: { url: true, mimeType: true },
  });
  if (!emoji) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let blobResult;
  try {
    // Explicit token — the SDK would otherwise prefer a VERCEL_OIDC_TOKEN in
    // the env, which lacks blob access (see the POST /api/emoji note).
    blobResult = await get(emoji.url, { access: "private", token: process.env.BLOB_READ_WRITE_TOKEN });
  } catch {
    return NextResponse.json({ error: "Emoji unavailable" }, { status: 502 });
  }
  if (!blobResult || blobResult.statusCode !== 200) {
    return NextResponse.json({ error: "Emoji unavailable" }, { status: 502 });
  }

  return new NextResponse(blobResult.stream, {
    status: 200,
    headers: {
      "Content-Type": emoji.mimeType,
      "X-Content-Type-Options": "nosniff",
      // Emoji rarely change and are workspace-wide; let the browser cache
      // aggressively in its own (non-shared) cache.
      "Cache-Control": "private, max-age=86400",
    },
  });
}

// DELETE /api/emoji/:id — remove a custom emoji. Anyone can *add* one, but
// removal is limited to the creator or an admin, so a random member can't
// wipe someone else's (or all) emoji. Also frees the Blob object.
export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const emoji = await prisma.customEmoji.findUnique({
    where: { id },
    select: { id: true, pathname: true, createdById: true },
  });
  if (!emoji) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const me = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  const canDelete = emoji.createdById === userId || me?.role === "ADMIN";
  if (!canDelete) {
    return NextResponse.json({ error: "Only the creator or an admin can remove this" }, { status: 403 });
  }

  await prisma.customEmoji.delete({ where: { id } });
  // Best-effort blob cleanup — the row is already gone, so a failed del()
  // just leaves an orphaned object, not a broken reference.
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    await del(emoji.pathname, { token: process.env.BLOB_READ_WRITE_TOKEN }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
