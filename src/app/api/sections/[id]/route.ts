import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/authz";

type RouteContext = { params: Promise<{ id: string }> };

const MAX_NAME = 48;

// Sections are per-user, so every mutation verifies ownership before touching
// the row — you can only rename/reorder/delete your own.
async function ownedSection(id: string, userId: string) {
  return prisma.channelSection.findFirst({ where: { id, userId }, select: { id: true } });
}

// PATCH /api/sections/:id — rename ({ name }) and/or reorder ({ position }).
export async function PATCH(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await ownedSection(id, userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const body = json as { name?: unknown; position?: unknown };

  const data: { name?: string; position?: number } = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (name.length > MAX_NAME) {
      return NextResponse.json({ error: `Name must be ${MAX_NAME} characters or fewer` }, { status: 400 });
    }
    data.name = name;
  }
  if (typeof body.position === "number" && Number.isFinite(body.position)) {
    data.position = Math.max(0, Math.trunc(body.position));
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const section = await prisma.channelSection.update({
    where: { id },
    data,
    select: { id: true, name: true, position: true },
  });
  return NextResponse.json({ section });
}

// DELETE /api/sections/:id — remove a section. Its channels revert to the
// default group automatically (ChannelPreference.sectionId is SetNull).
export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await ownedSection(id, userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.channelSection.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
