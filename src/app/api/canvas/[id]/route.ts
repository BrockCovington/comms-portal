import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/authz";
import { encryptMessage, decryptMessage } from "@/lib/crypto";

type RouteContext = { params: Promise<{ id: string }> };

const MAX_TITLE = 120;
const MAX_BODY = 100_000;

// GET /api/canvas/:id — a canvas with its decrypted body. Any signed-in user
// can read (workspace-wide); the response says whether the caller may edit.
export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const canvas = await prisma.canvas.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      body: true,
      createdById: true,
      updatedAt: true,
      createdBy: { select: { name: true } },
    },
  });
  if (!canvas) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    id: canvas.id,
    title: canvas.title,
    body: canvas.body ? decryptMessage(canvas.body) : "",
    createdByName: canvas.createdBy.name,
    updatedAt: canvas.updatedAt,
    canEdit: canvas.createdById === userId,
  });
}

// PATCH /api/canvas/:id — update title/body. Creator only.
export async function PATCH(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await prisma.canvas.findUnique({ where: { id }, select: { createdById: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.createdById !== userId) {
    return NextResponse.json({ error: "Only the creator can edit this canvas" }, { status: 403 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const b = json as { title?: unknown; body?: unknown };
  const data: { title?: string; body?: string } = {};
  if (b.title !== undefined) data.title = String(b.title).trim().slice(0, MAX_TITLE) || "Untitled canvas";
  if (b.body !== undefined) {
    const body = String(b.body).slice(0, MAX_BODY);
    data.body = body ? encryptMessage(body) : "";
  }

  await prisma.canvas.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}

// DELETE /api/canvas/:id — creator or an admin.
export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const canvas = await prisma.canvas.findUnique({ where: { id }, select: { createdById: true } });
  if (!canvas) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const me = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (canvas.createdById !== userId && me?.role !== "ADMIN") {
    return NextResponse.json({ error: "Only the creator or an admin can delete this" }, { status: 403 });
  }

  await prisma.canvas.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
