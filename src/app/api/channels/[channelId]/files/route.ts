import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId, checkChannelAccess } from "@/lib/authz";
import { decryptLinkPreview } from "@/lib/unfurl";

type RouteContext = { params: Promise<{ channelId: string }> };

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const LIST_LIMIT = 100;

// GET /api/channels/:channelId/files — everything shared in this channel, for
// the header's "Files & links" tab: uploaded files (attachments linked to a
// message) plus unfurled links. Access-checked the same as reading the channel.
export async function GET(_request: Request, { params }: RouteContext) {
  const { channelId } = await params;
  const userId = await getCurrentUserId();

  const access = await checkChannelAccess(userId, channelId);
  if (!access.ok) {
    return NextResponse.json({ error: "No access" }, { status: access.status });
  }

  const [attachments, linkRows] = await Promise.all([
    prisma.attachment.findMany({
      where: { channelId, messageId: { not: null } },
      orderBy: { createdAt: "desc" },
      take: LIST_LIMIT,
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        size: true,
        createdAt: true,
        uploadedBy: { select: { name: true } },
      },
    }),
    prisma.linkPreview.findMany({
      where: { message: { channelId, deletedAt: null } },
      orderBy: { createdAt: "desc" },
      take: LIST_LIMIT,
      select: {
        messageId: true,
        url: true,
        title: true,
        description: true,
        imageUrl: true,
        siteName: true,
        createdAt: true,
      },
    }),
  ]);

  const files = attachments.map((a) => ({
    id: a.id,
    fileName: a.fileName,
    mimeType: a.mimeType,
    size: a.size,
    createdAt: a.createdAt,
    uploadedByName: a.uploadedBy.name,
  }));

  const links = linkRows.map((l) => {
    const d = decryptLinkPreview(l);
    return {
      messageId: l.messageId,
      url: d.url,
      title: d.title,
      siteName: d.siteName,
      imageUrl: d.imageUrl,
      createdAt: l.createdAt,
    };
  });

  return NextResponse.json({ files, links });
}

// POST /api/channels/:channelId/files — upload a file, before it's attached
// to any message. Creates an "orphan" Attachment (messageId: null) scoped to
// this channel and uploader; POST .../messages links it when the message is
// actually sent. The Blob URL never leaves this route — everything else
// (including the client) only ever sees the attachment's id, and fetches its
// bytes through the access-checked /api/files/[id] proxy.
export async function POST(request: Request, { params }: RouteContext) {
  const { channelId } = await params;
  const userId = await getCurrentUserId();

  const access = await checkChannelAccess(userId, channelId);
  if (!access.ok) {
    return NextResponse.json({ error: "No access" }, { status: access.status });
  }
  if (access.channel.archivedAt) {
    return NextResponse.json({ error: "This channel is archived" }, { status: 400 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "File uploads aren't configured on this server yet." },
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
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File is too large (max 10MB)" }, { status: 400 });
  }

  const pathname = `channels/${channelId}/${crypto.randomUUID()}-${file.name}`;
  const blob = await put(pathname, file, {
    access: "private", // requires BLOB_READ_WRITE_TOKEN to read back — see /api/files/[id]
    contentType: file.type || "application/octet-stream",
  });

  const attachment = await prisma.attachment.create({
    data: {
      channelId,
      uploadedById: userId!,
      url: blob.url,
      pathname: blob.pathname,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
    },
    select: { id: true, fileName: true, mimeType: true, size: true },
  });

  return NextResponse.json({ attachment }, { status: 201 });
}
