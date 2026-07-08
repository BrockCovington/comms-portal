import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";
import { updateRoleSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ userId: string }> };

// PATCH /api/admin/users/:userId/role — promote or demote a user. Admin-only.
export async function PATCH(request: Request, { params }: RouteContext) {
  const { userId } = await params;
  const access = await requireAdmin();
  if (!access.ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: access.status });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateRoleSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });
  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Guard against an accidental lockout: don't let the sole remaining admin
  // demote themselves. (Nothing stops another admin from demoting them.)
  if (
    userId === access.userId &&
    targetUser.role === "ADMIN" &&
    parsed.data.role === "EMPLOYEE"
  ) {
    const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
    if (adminCount <= 1) {
      return NextResponse.json({ error: "Can't remove the last admin" }, { status: 400 });
    }
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { role: parsed.data.role },
    select: { id: true, name: true, email: true, role: true },
  });

  return NextResponse.json({ user: updated });
}
