import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/authz";
import { encryptMessage, decryptMessage } from "@/lib/crypto";

type RouteContext = { params: Promise<{ id: string }> };

const MAX_TEXT = 1000;

// POST /api/lists/:id/items — add an item. Any signed-in member can add
// (lists are collaborative). Item text is encrypted at rest.
export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const list = await prisma.list.findUnique({ where: { id }, select: { id: true } });
  if (!list) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const text = String((json as { text?: unknown }).text ?? "").trim().slice(0, MAX_TEXT);
  if (!text) return NextResponse.json({ error: "Item text is required" }, { status: 400 });

  const last = await prisma.listItem.findFirst({
    where: { listId: id },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  const item = await prisma.listItem.create({
    data: { listId: id, text: encryptMessage(text), position: (last?.position ?? -1) + 1 },
    select: { id: true, text: true, done: true, dueAt: true, assignee: { select: { id: true, name: true, image: true } } },
  });
  await prisma.list.update({ where: { id }, data: { updatedAt: new Date() } });

  return NextResponse.json(
    {
      item: {
        id: item.id,
        text: decryptMessage(item.text),
        done: item.done,
        dueAt: item.dueAt?.toISOString() ?? null,
        assignee: item.assignee,
      },
    },
    { status: 201 }
  );
}
