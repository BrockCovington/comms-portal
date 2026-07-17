import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/authz";
import { getListsForList } from "@/lib/lists";

const MAX_TITLE = 120;

// GET /api/lists — all lists (metadata + item counts).
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ lists: await getListsForList() });
}

// POST /api/lists — create a list.
export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const title = String((json as { title?: unknown }).title ?? "").trim().slice(0, MAX_TITLE) || "Untitled list";

  const list = await prisma.list.create({ data: { title, createdById: userId }, select: { id: true } });
  return NextResponse.json({ id: list.id }, { status: 201 });
}
