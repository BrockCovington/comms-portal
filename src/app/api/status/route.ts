import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/authz";
import { statusSchema } from "@/lib/validation";

// Resolve a stored status to its active form (null once expired), so callers
// never have to special-case a lingering expired row.
function activeStatus(row: {
  statusEmoji: string | null;
  statusText: string | null;
  statusExpiresAt: Date | null;
}) {
  const expired = row.statusExpiresAt !== null && row.statusExpiresAt.getTime() <= Date.now();
  if (expired || (!row.statusEmoji && !row.statusText)) {
    return { emoji: null, text: null, expiresAt: null };
  }
  return {
    emoji: row.statusEmoji,
    text: row.statusText,
    expiresAt: row.statusExpiresAt?.toISOString() ?? null,
  };
}

// GET /api/status — the current user's active status.
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { statusEmoji: true, statusText: true, statusExpiresAt: true },
  });
  return NextResponse.json(user ? activeStatus(user) : { emoji: null, text: null, expiresAt: null });
}

// PUT /api/status — set (or update) your status. An empty emoji + text clears
// it, so the client can "save" an emptied form to remove the status too.
export async function PUT(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = statusSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const emoji = parsed.data.emoji?.trim() || null;
  const text = parsed.data.text?.trim() || null;
  const expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;

  const cleared = !emoji && !text;
  const user = await prisma.user.update({
    where: { id: userId },
    data: cleared
      ? { statusEmoji: null, statusText: null, statusExpiresAt: null }
      : { statusEmoji: emoji, statusText: text, statusExpiresAt: expiresAt },
    select: { statusEmoji: true, statusText: true, statusExpiresAt: true },
  });

  return NextResponse.json(activeStatus(user));
}

// DELETE /api/status — clear your status.
export async function DELETE() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await prisma.user.update({
    where: { id: userId },
    data: { statusEmoji: null, statusText: null, statusExpiresAt: null },
  });
  return NextResponse.json({ emoji: null, text: null, expiresAt: null });
}
