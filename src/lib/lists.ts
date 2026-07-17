import { prisma } from "@/lib/prisma";

export type ListSummary = {
  id: string;
  title: string;
  createdByName: string | null;
  itemCount: number;
  doneCount: number;
  updatedAt: Date;
};

// All lists in the workspace, newest-edited first — for the /lists index.
export async function getListsForList(): Promise<ListSummary[]> {
  const rows = await prisma.list.findMany({
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: {
      id: true,
      title: true,
      updatedAt: true,
      createdBy: { select: { name: true } },
      items: { select: { done: true } },
    },
  });
  return rows.map((l) => ({
    id: l.id,
    title: l.title,
    createdByName: l.createdBy.name,
    itemCount: l.items.length,
    doneCount: l.items.filter((i) => i.done).length,
    updatedAt: l.updatedAt,
  }));
}
