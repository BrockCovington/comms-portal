import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/authz";
import { huddleReactionsSchema } from "@/lib/validation";
import { getHuddleReactions } from "@/lib/huddleReactions";

// GET /api/huddle-reactions — the current user's huddle quick-reaction set
// (their customized "main 8", or the defaults).
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ reactions: await getHuddleReactions(userId) });
}

// PUT /api/huddle-reactions — replace the set (1–8 tokens). Each token is
// validated the same way a sent reaction is (unicode grapheme or :name:), so
// junk can't be stored. Purely personal — only ever the caller's own row.
export async function PUT(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = huddleReactionsSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  // De-dupe while preserving order — the same emoji twice in the row is noise.
  const reactions = Array.from(new Set(parsed.data.reactions));

  await prisma.user.update({
    where: { id: userId },
    data: { huddleReactions: reactions },
  });

  return NextResponse.json({ reactions });
}
