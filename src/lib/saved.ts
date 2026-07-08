import { prisma } from "@/lib/prisma";
import { decryptMessage } from "@/lib/crypto";
import { otherMemberLabel } from "@/lib/dm";

export type SavedMessageSummary = {
  messageId: string;
  channelId: string;
  channelName: string;
  isDm: boolean;
  parentId: string | null;
  preview: string;
  authorName: string | null;
  savedAt: Date;
};

// Shared shape with getThreadsForUser: resolve DM display names in bulk,
// decrypt previews at read time (bodies are encrypted at rest). A saved
// message whose underlying message was since deleted is dropped — nothing
// useful to show, and the flag row itself is harmless leftover state.
export async function getSavedMessagesForUser(userId: string): Promise<SavedMessageSummary[]> {
  const saved = await prisma.savedMessage.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      createdAt: true,
      message: {
        select: {
          id: true,
          body: true,
          deletedAt: true,
          parentId: true,
          channelId: true,
          channel: { select: { name: true, isDm: true } },
          user: { select: { name: true } },
        },
      },
    },
  });

  const live = saved.filter((s) => !s.message.deletedAt);
  if (live.length === 0) return [];

  const dmChannelIds = live.filter((s) => s.message.channel.isDm).map((s) => s.message.channelId);
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

  return live.map((s) => {
    const m = s.message;
    const channelName = m.channel.isDm
      ? otherMemberLabel(dmMembersByChannel.get(m.channelId) ?? [], userId)
      : m.channel.name;
    return {
      messageId: m.id,
      channelId: m.channelId,
      channelName,
      isDm: m.channel.isDm,
      parentId: m.parentId,
      preview: decryptMessage(m.body).slice(0, 140),
      authorName: m.user.name,
      savedAt: s.createdAt,
    };
  });
}
