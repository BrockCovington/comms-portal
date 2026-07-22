import { prisma } from "@/lib/prisma";

export type GroupSummary = { id: string; handle: string; name: string; memberCount: number };

// All user groups, for the workspace-global GroupsProvider + admin list.
export async function getGroupsForList(): Promise<GroupSummary[]> {
  const rows = await prisma.userGroup.findMany({
    orderBy: { handle: "asc" },
    select: { id: true, handle: true, name: true, _count: { select: { members: true } } },
  });
  return rows.map((g) => ({ id: g.id, handle: g.handle, name: g.name, memberCount: g._count.members }));
}
