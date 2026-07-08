import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/authz";

type RouteContext = { params: Promise<{ id: string }> };

// PATCH /api/notifications/:id/read — mark one notification read. Ownership
// is enforced by the compound where (id + userId), same anti-IDOR shape used
// elsewhere in this app — you can only ever mark your own read. Idempotent.
export async function PATCH(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await prisma.notification.updateMany({
    where: { id, userId, readAt: null },
    data: { readAt: new Date() },
  });

  if (result.count === 0) {
    // Either it doesn't exist, isn't yours, or was already read — all three
    // are fine to report as "not found" without distinguishing which.
    const exists = await prisma.notification.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
