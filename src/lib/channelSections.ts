import { prisma } from "@/lib/prisma";

export type ChannelSectionSummary = {
  id: string;
  name: string;
  position: number;
};

// A user's custom sidebar sections, in display order. Personal to the user
// (see the ChannelSection model note) — never leaks another user's grouping.
export async function getChannelSections(userId: string): Promise<ChannelSectionSummary[]> {
  const rows = await prisma.channelSection.findMany({
    where: { userId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, position: true },
  });
  return rows;
}
