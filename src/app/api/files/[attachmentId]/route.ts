import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId, checkChannelAccess } from "@/lib/authz";

type RouteContext = { params: Promise<{ attachmentId: string }> };

// Only these render inline as <img>. SVG is deliberately excluded — it can
// carry <script>, and serving one `inline` at a top-level navigation is a
// known stored-XSS vector. Everything else (including SVG) force-downloads.
const INLINE_SAFE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

function sanitizeForHeader(value: string): string {
  // Strip characters that could break out of the quoted header value.
  return value.replace(/[\r\n"]/g, "");
}

// GET /api/files/:attachmentId — the ONLY way any attachment's bytes ever
// reach a client. Re-checks channel access on every request (not just once
// at upload time) via the exact same checkChannelAccess every other route
// uses, then fetches the blob server-side (authenticated via the private
// store's read-write token) and streams it back — the Vercel Blob URL never
// reaches the browser, and even if it did, the store being private means it
// wouldn't be fetchable without that token.
export async function GET(_request: Request, { params }: RouteContext) {
  const { attachmentId } = await params;
  const userId = await getCurrentUserId();

  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    select: { channelId: true, url: true, fileName: true, mimeType: true, size: true },
  });
  if (!attachment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const access = await checkChannelAccess(userId, attachment.channelId);
  if (!access.ok) {
    // Uniformly 404, not the access check's own status — this route doesn't
    // distinguish "no access" from "doesn't exist" the way other routes do,
    // since leaking which private files exist is worse than being consistent.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // The store is private — this authenticates with BLOB_READ_WRITE_TOKEN
  // server-side. A bare `fetch(attachment.url)` would 403 without it, which
  // is exactly the point: the URL alone (even if it leaked) isn't enough.
  let blobResult;
  try {
    blobResult = await get(attachment.url, { access: "private" });
  } catch {
    return NextResponse.json({ error: "File unavailable" }, { status: 502 });
  }
  if (!blobResult || blobResult.statusCode !== 200) {
    return NextResponse.json({ error: "File unavailable" }, { status: 502 });
  }

  const disposition = INLINE_SAFE_MIME_TYPES.has(attachment.mimeType) ? "inline" : "attachment";
  const fileName = sanitizeForHeader(attachment.fileName);

  return new NextResponse(blobResult.stream, {
    status: 200,
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Disposition": `${disposition}; filename="${fileName}"`,
      "Content-Length": String(attachment.size),
      "X-Content-Type-Options": "nosniff",
      // Cacheable in the browser's own cache (it already passed the access
      // check to get here) but never by a shared/CDN cache.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
