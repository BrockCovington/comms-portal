import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";
import { setGroupMembersSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

// PUT /api/admin/groups/:id/members — replace a group's membership with the
// given set of user ids (admin only).
export async function PUT(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const access = await requireAdmin();
  if (!access.ok) return NextResponse.json({ error: "Forbidden" }, { status: access.status });

  const group = await prisma.userGroup.findUnique({ where: { id }, select: { id: true } });
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = setGroupMembersSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  // Keep only real users, then replace the set atomically.
  const valid = await prisma.user.findMany({
    where: { id: { in: parsed.data.memberIds } },
    select: { id: true },
  });
  await prisma.$transaction([
    prisma.userGroupMember.deleteMany({ where: { groupId: id } }),
    prisma.userGroupMember.createMany({
      data: valid.map((u) => ({ groupId: id, userId: u.id })),
      skipDuplicates: true,
    }),
  ]);
  return NextResponse.json({ ok: true, memberCount: valid.length });
}
