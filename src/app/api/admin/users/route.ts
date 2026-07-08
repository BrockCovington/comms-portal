import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";

// GET /api/admin/users — every org member with their role, for the admin
// dashboard's user-management table. Admin-only: this is an org-management
// view, not a per-channel one, so it gates on requireAdmin() rather than
// checkChannelAccess.
export async function GET() {
  const access = await requireAdmin();
  if (!access.ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: access.status });
  }

  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, image: true, role: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ users });
}
