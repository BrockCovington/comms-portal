import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";
import { createGroupSchema } from "@/lib/validation";

// POST /api/admin/groups — create a user group (admin only).
export async function POST(request: Request) {
  const access = await requireAdmin();
  if (!access.ok) return NextResponse.json({ error: "Forbidden" }, { status: access.status });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createGroupSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  try {
    const group = await prisma.userGroup.create({
      data: { handle: parsed.data.handle, name: parsed.data.name, createdById: access.userId },
      select: { id: true },
    });
    return NextResponse.json({ id: group.id }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "That handle is already taken" }, { status: 409 });
    }
    throw err;
  }
}
