import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/authz";

// GET /api/users — org members to start a DM with. Every row in User is
// already domain-locked at sign-in (see ALLOWED_EMAIL_DOMAIN in auth.ts), so
// "signed in" is the only access check needed here — there's no per-channel
// access to enforce for a plain member directory.
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const users = await prisma.user.findMany({
    where: { id: { not: userId } },
    select: { id: true, name: true, email: true, image: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ users });
}
