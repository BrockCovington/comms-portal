import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/authz";

const MAX_EMOJI_SIZE = 256 * 1024; // 256KB — emoji are tiny; keeps them snappy
const NAME_PATTERN = /^[a-z0-9_-]{2,32}$/;
const ALLOWED_TYPES = new Set(["image/png", "image/gif", "image/jpeg", "image/webp"]);

// GET /api/emoji — every custom emoji in the workspace, for the picker and
// for client-side :shortcode: / reaction resolution. The client-facing url
// is the proxy path (GET /api/emoji/:id), never the private Blob URL.
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await prisma.customEmoji.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const emoji = rows.map((e) => ({ id: e.id, name: e.name, url: `/api/emoji/${e.id}` }));
  return NextResponse.json({ emoji });
}

// POST /api/emoji — add a custom emoji (any member, per the product choice).
// Multipart: `name` + `file`. Image goes to Blob with PUBLIC access (these
// are workspace-wide display assets, not confidential — see the model note).
export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Custom emoji aren't configured on this server yet." },
      { status: 503 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }

  const rawName = String(formData.get("name") ?? "")
    .trim()
    .toLowerCase()
    .replace(/^:|:$/g, ""); // tolerate a pasted :name:
  if (!NAME_PATTERN.test(rawName)) {
    return NextResponse.json(
      { error: "Name must be 2–32 chars: lowercase letters, numbers, _ or -" },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No image provided" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Use a PNG, GIF, JPEG, or WebP image" }, { status: 400 });
  }
  if (file.size > MAX_EMOJI_SIZE) {
    return NextResponse.json({ error: "Image is too large (max 256KB)" }, { status: 400 });
  }

  const existing = await prisma.customEmoji.findUnique({ where: { name: rawName }, select: { id: true } });
  if (existing) {
    return NextResponse.json({ error: `:${rawName}: already exists` }, { status: 409 });
  }

  const pathname = `emoji/${rawName}-${crypto.randomUUID()}`;
  // Private store (matches file attachments) — bytes are streamed back via
  // the access-checked GET /api/emoji/:id proxy, never the raw Blob URL.
  // The token is passed explicitly: the SDK otherwise prefers a
  // VERCEL_OIDC_TOKEN if one is present in the env (the Vercel CLI writes one
  // into .env.local), and that OIDC identity lacks blob write access here.
  const blob = await put(pathname, file, {
    access: "private",
    contentType: file.type,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });

  const created = await prisma.customEmoji.create({
    data: { name: rawName, url: blob.url, pathname, mimeType: file.type, createdById: userId },
    select: { id: true, name: true },
  });

  const emoji = { id: created.id, name: created.name, url: `/api/emoji/${created.id}` };
  return NextResponse.json({ emoji }, { status: 201 });
}
