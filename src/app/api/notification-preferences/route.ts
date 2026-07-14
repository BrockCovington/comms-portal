import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/authz";

// User-global notification prefs: Do Not Disturb (snooze-until) and keyword
// alerts. One row per user, created lazily on first write.
const updateSchema = z.object({
  // ISO string to snooze until, or null to clear DND. Absent = leave as-is.
  dndUntil: z.string().datetime().nullable().optional(),
  // Full replacement list; each 2–40 chars, max 20 words. Absent = leave as-is.
  keywords: z
    .array(z.string().trim().toLowerCase().min(2).max(40))
    .max(20)
    .optional(),
});

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pref = await prisma.notificationPreference.findUnique({
    where: { userId },
    select: { dndUntil: true, keywords: true },
  });
  return NextResponse.json({
    dndUntil: pref?.dndUntil ?? null,
    keywords: pref?.keywords ?? [],
  });
}

export async function PUT(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = updateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const data: { dndUntil?: Date | null; keywords?: string[] } = {};
  if (parsed.data.dndUntil !== undefined) {
    data.dndUntil = parsed.data.dndUntil ? new Date(parsed.data.dndUntil) : null;
  }
  if (parsed.data.keywords !== undefined) {
    // De-dupe and drop empties.
    data.keywords = [...new Set(parsed.data.keywords.filter(Boolean))];
  }

  const pref = await prisma.notificationPreference.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
    select: { dndUntil: true, keywords: true },
  });

  return NextResponse.json({ dndUntil: pref.dndUntil, keywords: pref.keywords });
}
