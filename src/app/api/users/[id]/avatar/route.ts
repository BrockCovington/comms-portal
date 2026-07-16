import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/authz";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/users/:id/avatar — stream a user's uploaded profile picture. The
// store is private (like emoji/attachments), so the blob is fetched
// server-side with the token and streamed back; the raw Blob URL never
// reaches the browser. Only requires a signed-in user — avatars are
// workspace-wide display assets, not channel-scoped. A `?v=` cache-buster is
// on the stored path (ignored here) so the browser refetches after a change.
export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id },
    select: { avatarBlobUrl: true, avatarMimeType: true },
  });
  if (!user?.avatarBlobUrl) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let blobResult;
  try {
    // Explicit token — the SDK would otherwise prefer a VERCEL_OIDC_TOKEN in
    // the env, which lacks blob access (see GET /api/emoji/:id note).
    blobResult = await get(user.avatarBlobUrl, {
      access: "private",
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
  } catch {
    return NextResponse.json({ error: "Avatar unavailable" }, { status: 502 });
  }
  if (!blobResult || blobResult.statusCode !== 200) {
    return NextResponse.json({ error: "Avatar unavailable" }, { status: 502 });
  }

  return new NextResponse(blobResult.stream, {
    status: 200,
    headers: {
      "Content-Type": user.avatarMimeType ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      // The path carries a version token that changes on every upload, so it's
      // safe to let the browser cache a given version indefinitely.
      "Cache-Control": "private, max-age=86400",
    },
  });
}
