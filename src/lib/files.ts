import { prisma } from "@/lib/prisma";
import { otherMemberLabel } from "@/lib/dm";

export type FileSummary = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: Date;
  channelId: string;
  channelName: string;
  isDm: boolean;
  uploadedByName: string | null;
};

const RECENT_FILES_LIMIT = 100;

// Shared by GET /api/files and the /files page. Access is expressed as a
// bulk WHERE rather than a per-row checkChannelAccess call: a public
// channel, or a private/DM channel this user is a member of — the exact
// same rule, just as a listing-query condition instead of a single lookup.
export async function getFilesForUser(userId: string): Promise<FileSummary[]> {
  const attachments = await prisma.attachment.findMany({
    where: {
      messageId: { not: null },
      channel: {
        OR: [{ isPrivate: false, isDm: false }, { members: { some: { userId } } }],
      },
    },
    orderBy: { createdAt: "desc" },
    take: RECENT_FILES_LIMIT,
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      size: true,
      createdAt: true,
      channel: { select: { id: true, name: true, isDm: true } },
      uploadedBy: { select: { name: true } },
    },
  });

  if (attachments.length === 0) return [];

  // DM channel names are a fixed internal debug label, never rendered —
  // resolve the real display name the same way the sidebar does.
  const dmChannelIds = [...new Set(attachments.filter((a) => a.channel.isDm).map((a) => a.channel.id))];
  const dmMembers = dmChannelIds.length
    ? await prisma.channelMember.findMany({
        where: { channelId: { in: dmChannelIds } },
        select: { channelId: true, userId: true, user: { select: { name: true, email: true } } },
      })
    : [];
  const dmMembersByChannel = new Map<string, typeof dmMembers>();
  for (const m of dmMembers) {
    const list = dmMembersByChannel.get(m.channelId) ?? [];
    list.push(m);
    dmMembersByChannel.set(m.channelId, list);
  }

  return attachments.map((a) => ({
    id: a.id,
    fileName: a.fileName,
    mimeType: a.mimeType,
    size: a.size,
    createdAt: a.createdAt,
    channelId: a.channel.id,
    channelName: a.channel.isDm
      ? otherMemberLabel(dmMembersByChannel.get(a.channel.id) ?? [], userId)
      : a.channel.name,
    isDm: a.channel.isDm,
    uploadedByName: a.uploadedBy.name,
  }));
}
