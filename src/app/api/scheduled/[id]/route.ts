import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/authz";

type RouteContext = { params: Promise<{ id: string }> };

// DELETE /api/scheduled/:id — cancel a pending scheduled message (owner
// only). Idempotent: canceling an already-sent/canceled one is a no-op.
export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Compound where (id + userId) enforces ownership — you can only cancel
  // your own. Only cancels ones not already delivered.
  const result = await prisma.scheduledMessage.updateMany({
    where: { id, userId, sentAt: null, canceledAt: null },
    data: { canceledAt: new Date() },
  });

  if (result.count === 0) {
    const exists = await prisma.scheduledMessage.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
