import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId, checkChannelAccess } from "@/lib/authz";
import { encryptMessage } from "@/lib/crypto";
import { computeNextRun, parseSchedule, getWorkflowsForList } from "@/lib/workflows";

const MAX_TITLE = 120;
const MAX_BODY = 4000;

// GET /api/workflows — every workflow in the workspace (metadata only).
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ workflows: await getWorkflowsForList() });
}

// POST /api/workflows — create a recurring auto-post. The caller must be able
// to post to the target channel (same access check as sending a message).
export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const b = json as Record<string, unknown>;

  const title = String(b.title ?? "").trim().slice(0, MAX_TITLE) || "Untitled workflow";
  const body = String(b.body ?? "").trim().slice(0, MAX_BODY);
  if (!body) return NextResponse.json({ error: "A message to post is required" }, { status: 400 });

  const channelId = String(b.channelId ?? "");
  if (!channelId) return NextResponse.json({ error: "Pick a channel to post to" }, { status: 400 });
  const access = await checkChannelAccess(userId, channelId);
  if (!access.ok) return NextResponse.json({ error: "No access to that channel" }, { status: access.status });
  if (access.channel.archivedAt) {
    return NextResponse.json({ error: "That channel is archived" }, { status: 400 });
  }

  const schedule = parseSchedule(b);
  if (!schedule) return NextResponse.json({ error: "Invalid schedule" }, { status: 400 });

  const enabled = b.enabled === undefined ? true : Boolean(b.enabled);
  const nextRunAt = computeNextRun(schedule, new Date());

  const wf = await prisma.workflow.create({
    data: {
      title,
      channelId,
      createdById: userId,
      body: encryptMessage(body),
      frequency: schedule.frequency,
      dayOfWeek: schedule.dayOfWeek,
      hour: schedule.hour,
      minute: schedule.minute,
      timezone: schedule.timezone,
      enabled,
      nextRunAt,
    },
    select: { id: true },
  });
  return NextResponse.json({ id: wf.id }, { status: 201 });
}
