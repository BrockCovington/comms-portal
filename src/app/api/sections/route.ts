import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/authz";
import { getChannelSections } from "@/lib/channelSections";

const MAX_NAME = 48;
const MAX_SECTIONS = 30; // a sane ceiling so nobody scripts thousands

// GET /api/sections — the current user's custom sidebar sections.
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ sections: await getChannelSections(userId) });
}

// POST /api/sections — create a section. New sections go to the end.
export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = String((json as { name?: unknown })?.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (name.length > MAX_NAME) {
    return NextResponse.json({ error: `Name must be ${MAX_NAME} characters or fewer` }, { status: 400 });
  }

  const count = await prisma.channelSection.count({ where: { userId } });
  if (count >= MAX_SECTIONS) {
    return NextResponse.json({ error: "Too many sections" }, { status: 400 });
  }

  const section = await prisma.channelSection.create({
    data: { userId, name, position: count },
    select: { id: true, name: true, position: true },
  });

  return NextResponse.json({ section }, { status: 201 });
}
