import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/authz";
import { encryptMessage } from "@/lib/crypto";
import { getCanvasesForList } from "@/lib/canvas";

const MAX_TITLE = 120;
const MAX_BODY = 100_000;

// GET /api/canvas — list all canvases (metadata only).
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ canvases: await getCanvasesForList() });
}

// POST /api/canvas — create a canvas. Body is encrypted at rest like messages.
export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const b = json as { title?: unknown; body?: unknown };
  const title = String(b.title ?? "").trim().slice(0, MAX_TITLE) || "Untitled canvas";
  const body = String(b.body ?? "").slice(0, MAX_BODY);

  const canvas = await prisma.canvas.create({
    data: { title, body: body ? encryptMessage(body) : "", createdById: userId },
    select: { id: true },
  });

  return NextResponse.json({ id: canvas.id }, { status: 201 });
}
