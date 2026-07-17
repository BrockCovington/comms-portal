import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/authz";
import { decryptMessage } from "@/lib/crypto";

type RouteContext = { params: Promise<{ id: string }> };

const MAX_TITLE = 120;

// GET /api/lists/:id — a list with its items (item text decrypted, assignee
// names resolved). Workspace-wide readable; canManage says whether the caller
// can rename/delete the whole list (creator or admin).
export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const list = await prisma.list.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      createdById: true,
      createdBy: { select: { name: true } },
      items: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          text: true,
          done: true,
          dueAt: true,
          assignee: { select: { id: true, name: true, image: true } },
        },
      },
    },
  });
  if (!list) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const me = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });

  return NextResponse.json({
    id: list.id,
    title: list.title,
    createdByName: list.createdBy.name,
    canManage: list.createdById === userId || me?.role === "ADMIN",
    items: list.items.map((i) => ({
      id: i.id,
      text: i.text ? decryptMessage(i.text) : "",
      done: i.done,
      dueAt: i.dueAt?.toISOString() ?? null,
      assignee: i.assignee,
    })),
  });
}

// PATCH /api/lists/:id — rename (creator or admin).
export async function PATCH(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const list = await prisma.list.findUnique({ where: { id }, select: { createdById: true } });
  if (!list) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (list.createdById !== userId && me?.role !== "ADMIN") {
    return NextResponse.json({ error: "Only the creator or an admin can rename this list" }, { status: 403 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const title = String((json as { title?: unknown }).title ?? "").trim().slice(0, MAX_TITLE) || "Untitled list";
  await prisma.list.update({ where: { id }, data: { title } });
  return NextResponse.json({ ok: true });
}

// DELETE /api/lists/:id — creator or admin.
export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const list = await prisma.list.findUnique({ where: { id }, select: { createdById: true } });
  if (!list) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (list.createdById !== userId && me?.role !== "ADMIN") {
    return NextResponse.json({ error: "Only the creator or an admin can delete this list" }, { status: 403 });
  }

  await prisma.list.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
