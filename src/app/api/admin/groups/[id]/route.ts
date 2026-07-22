import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";
import { updateGroupSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

// PATCH /api/admin/groups/:id — rename / re-handle a group (admin only).
export async function PATCH(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const access = await requireAdmin();
  if (!access.ok) return NextResponse.json({ error: "Forbidden" }, { status: access.status });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = updateGroupSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  try {
    await prisma.userGroup.update({ where: { id }, data: parsed.data });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "That handle is already taken" }, { status: 409 });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw err;
  }
}

// DELETE /api/admin/groups/:id — remove a group (admin only). Members cascade.
export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const access = await requireAdmin();
  if (!access.ok) return NextResponse.json({ error: "Forbidden" }, { status: access.status });

  await prisma.userGroup.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
