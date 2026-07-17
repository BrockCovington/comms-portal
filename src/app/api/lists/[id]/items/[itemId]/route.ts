import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/authz";
import { encryptMessage } from "@/lib/crypto";

type RouteContext = { params: Promise<{ id: string; itemId: string }> };

const MAX_TEXT = 1000;

// PATCH /api/lists/:id/items/:itemId — update text / done / assignee / due.
// Any signed-in member can edit (collaborative task tracking).
export async function PATCH(request: Request, { params }: RouteContext) {
  const { id, itemId } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const item = await prisma.listItem.findFirst({ where: { id: itemId, listId: id }, select: { id: true } });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const b = json as { text?: unknown; done?: unknown; assigneeId?: unknown; dueAt?: unknown };

  const data: { text?: string; done?: boolean; assigneeId?: string | null; dueAt?: Date | null } = {};
  if (typeof b.text === "string") {
    const text = b.text.trim().slice(0, MAX_TEXT);
    if (!text) return NextResponse.json({ error: "Item text is required" }, { status: 400 });
    data.text = encryptMessage(text);
  }
  if (typeof b.done === "boolean") data.done = b.done;
  if (b.assigneeId !== undefined) {
    const assigneeId = b.assigneeId === null ? null : String(b.assigneeId);
    if (assigneeId) {
      const exists = await prisma.user.findUnique({ where: { id: assigneeId }, select: { id: true } });
      if (!exists) return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    data.assigneeId = assigneeId;
  }
  if (b.dueAt !== undefined) {
    data.dueAt = b.dueAt ? new Date(String(b.dueAt)) : null;
  }

  await prisma.listItem.update({ where: { id: itemId }, data });
  await prisma.list.update({ where: { id }, data: { updatedAt: new Date() } });
  return NextResponse.json({ ok: true });
}

// DELETE /api/lists/:id/items/:itemId — remove an item.
export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id, itemId } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const item = await prisma.listItem.findFirst({ where: { id: itemId, listId: id }, select: { id: true } });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.listItem.delete({ where: { id: itemId } });
  await prisma.list.update({ where: { id }, data: { updatedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
