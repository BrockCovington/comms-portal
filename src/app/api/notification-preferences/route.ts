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
  // Recurring quiet hours (notification schedule).
  quietHoursEnabled: z.boolean().optional(),
  quietStartMinute: z.number().int().min(0).max(1439).optional(),
  quietEndMinute: z.number().int().min(0).max(1439).optional(),
  quietTimezone: z.string().trim().min(1).max(64).optional(),
});

const QUIET_SELECT = {
  dndUntil: true,
  keywords: true,
  quietHoursEnabled: true,
  quietStartMinute: true,
  quietEndMinute: true,
  quietTimezone: true,
} as const;

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pref = await prisma.notificationPreference.findUnique({
    where: { userId },
    select: QUIET_SELECT,
  });
  return NextResponse.json({
    dndUntil: pref?.dndUntil ?? null,
    keywords: pref?.keywords ?? [],
    quietHoursEnabled: pref?.quietHoursEnabled ?? false,
    quietStartMinute: pref?.quietStartMinute ?? 1320,
    quietEndMinute: pref?.quietEndMinute ?? 480,
    quietTimezone: pref?.quietTimezone ?? "UTC",
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

  const data: {
    dndUntil?: Date | null;
    keywords?: string[];
    quietHoursEnabled?: boolean;
    quietStartMinute?: number;
    quietEndMinute?: number;
    quietTimezone?: string;
  } = {};
  if (parsed.data.dndUntil !== undefined) {
    data.dndUntil = parsed.data.dndUntil ? new Date(parsed.data.dndUntil) : null;
  }
  if (parsed.data.keywords !== undefined) {
    // De-dupe and drop empties.
    data.keywords = [...new Set(parsed.data.keywords.filter(Boolean))];
  }
  if (parsed.data.quietHoursEnabled !== undefined) data.quietHoursEnabled = parsed.data.quietHoursEnabled;
  if (parsed.data.quietStartMinute !== undefined) data.quietStartMinute = parsed.data.quietStartMinute;
  if (parsed.data.quietEndMinute !== undefined) data.quietEndMinute = parsed.data.quietEndMinute;
  if (parsed.data.quietTimezone !== undefined) data.quietTimezone = parsed.data.quietTimezone;

  const pref = await prisma.notificationPreference.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
    select: QUIET_SELECT,
  });

  return NextResponse.json({
    dndUntil: pref.dndUntil,
    keywords: pref.keywords,
    quietHoursEnabled: pref.quietHoursEnabled,
    quietStartMinute: pref.quietStartMinute,
    quietEndMinute: pref.quietEndMinute,
    quietTimezone: pref.quietTimezone,
  });
}
