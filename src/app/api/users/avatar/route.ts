import { NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/authz";

const MAX_AVATAR_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

// The bytes live in a private Blob store and are streamed back through the
// access-checked proxy (GET /api/users/:id/avatar), so `image` holds that
// proxy path — never the raw Blob URL. A short cache-busting token makes the
// path change on every upload so browsers don't show a stale picture.
function avatarProxyPath(userId: string): string {
  return `/api/users/${userId}/avatar?v=${crypto.randomUUID().slice(0, 8)}`;
}

// POST /api/users/avatar — upload (or replace) your own profile picture.
// Multipart with a single `file`. You can only ever change your own.
export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Profile pictures aren't configured on this server yet." },
      { status: 503 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No image provided" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Use a PNG, JPEG, WebP, or GIF image" }, { status: 400 });
  }
  if (file.size > MAX_AVATAR_SIZE) {
    return NextResponse.json({ error: "Image is too large (max 2MB)" }, { status: 400 });
  }

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { image: true, oauthImage: true, avatarBlobPath: true },
  });
  if (!me) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const pathname = `avatars/${userId}-${crypto.randomUUID()}`;
  // Explicit token — the SDK would otherwise prefer a VERCEL_OIDC_TOKEN in
  // the env, which lacks blob write access (see POST /api/emoji for the full
  // note). Private store: bytes only reach the browser via the proxy.
  const blob = await put(pathname, file, {
    access: "private",
    contentType: file.type,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });

  // Preserve the original OAuth picture the first time a custom one is set,
  // so "Remove" can fall back to it. Once preserved, never overwrite it.
  const preservedOauth =
    me.oauthImage ??
    (me.image && !me.image.startsWith("/api/users/") ? me.image : null);

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      image: avatarProxyPath(userId),
      avatarBlobUrl: blob.url,
      avatarBlobPath: pathname,
      avatarMimeType: file.type,
      oauthImage: preservedOauth,
    },
    select: { image: true },
  });

  // Best-effort cleanup of the previous blob (the row already points at the
  // new one, so a failed del just orphans bytes — never a broken avatar).
  if (me.avatarBlobPath) {
    await del(me.avatarBlobPath, { token: process.env.BLOB_READ_WRITE_TOKEN }).catch(() => {});
  }

  return NextResponse.json({ image: updated.image }, { status: 201 });
}

// DELETE /api/users/avatar — remove your custom picture and fall back to the
// preserved OAuth image (or the initial-circle if there wasn't one).
export async function DELETE() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { oauthImage: true, avatarBlobPath: true },
  });
  if (!me) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      image: me.oauthImage ?? null,
      avatarBlobUrl: null,
      avatarBlobPath: null,
      avatarMimeType: null,
    },
    select: { image: true },
  });

  if (me.avatarBlobPath && process.env.BLOB_READ_WRITE_TOKEN) {
    await del(me.avatarBlobPath, { token: process.env.BLOB_READ_WRITE_TOKEN }).catch(() => {});
  }

  return NextResponse.json({ image: updated.image });
}
