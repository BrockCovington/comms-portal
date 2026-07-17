import { prisma } from "@/lib/prisma";

export type CanvasSummary = {
  id: string;
  title: string;
  createdByName: string | null;
  createdById: string;
  updatedAt: Date;
};

// All canvases in the workspace, newest-edited first — for the /canvas list.
// Canvases are workspace-wide readable (like a shared docs folder); the body
// isn't loaded here, just the metadata.
export async function getCanvasesForList(): Promise<CanvasSummary[]> {
  const rows = await prisma.canvas.findMany({
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: {
      id: true,
      title: true,
      createdById: true,
      updatedAt: true,
      createdBy: { select: { name: true } },
    },
  });
  return rows.map((c) => ({
    id: c.id,
    title: c.title,
    createdById: c.createdById,
    updatedAt: c.updatedAt,
    createdByName: c.createdBy.name,
  }));
}
