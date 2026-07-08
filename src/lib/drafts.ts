import { prisma } from "@/lib/prisma";
import { decryptMessage } from "@/lib/crypto";
import { otherMemberLabel } from "@/lib/dm";

export type DraftSummary = {
  channelId: string;
  channelName: string;
  isDm: boolean;
  preview: string;
  updatedAt: Date;
};

// Shared by GET /api/drafts and the /drafts page.
export async function getDraftsForUser(userId: string): Promise<DraftSummary[]> {
  const drafts = await prisma.draft.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      body: true,
      updatedAt: true,
      channel: { select: { id: true, name: true, isDm: true } },
    },
  });
  if (drafts.length === 0) return [];

  const dmChannelIds = drafts.filter((d) => d.channel.isDm).map((d) => d.channel.id);
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

  return drafts.map((d) => ({
    channelId: d.channel.id,
    channelName: d.channel.isDm
      ? otherMemberLabel(dmMembersByChannel.get(d.channel.id) ?? [], userId)
      : d.channel.name,
    isDm: d.channel.isDm,
    preview: decryptMessage(d.body).slice(0, 140),
    updatedAt: d.updatedAt,
  }));
}
