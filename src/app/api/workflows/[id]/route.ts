import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId, checkChannelAccess } from "@/lib/authz";
import { encryptMessage, decryptMessage } from "@/lib/crypto";
import { computeNextRun, parseSchedule, describeSchedule } from "@/lib/workflows";

type RouteContext = { params: Promise<{ id: string }> };

const MAX_TITLE = 120;
const MAX_BODY = 4000;

async function canManage(workflowCreatorId: string, userId: string): Promise<boolean> {
  if (workflowCreatorId === userId) return true;
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  return me?.role === "ADMIN";
}

// GET /api/workflows/:id — full workflow (body decrypted). Workspace-wide
// readable; canManage says whether the caller can edit/delete/run it.
export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const wf = await prisma.workflow.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      body: true,
      channelId: true,
      createdById: true,
      frequency: true,
      dayOfWeek: true,
      hour: true,
      minute: true,
      timezone: true,
      enabled: true,
      nextRunAt: true,
      lastRunAt: true,
      runCount: true,
      channel: { select: { name: true, isDm: true } },
      createdBy: { select: { name: true } },
    },
  });
  if (!wf) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    id: wf.id,
    title: wf.title,
    body: wf.body ? decryptMessage(wf.body) : "",
    channelId: wf.channelId,
    channelName: wf.channel.name,
    channelIsDm: wf.channel.isDm,
    frequency: wf.frequency,
    dayOfWeek: wf.dayOfWeek,
    hour: wf.hour,
    minute: wf.minute,
    timezone: wf.timezone,
    enabled: wf.enabled,
    nextRunAt: wf.enabled ? wf.nextRunAt.toISOString() : null,
    lastRunAt: wf.lastRunAt?.toISOString() ?? null,
    runCount: wf.runCount,
    scheduleLabel: describeSchedule(wf),
    createdByName: wf.createdBy.name,
    canManage: await canManage(wf.createdById, userId),
  });
}

// PATCH /api/workflows/:id — edit (creator or admin). Recomputes nextRunAt
// whenever the schedule changes or the workflow is (re)enabled.
export async function PATCH(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const wf = await prisma.workflow.findUnique({
    where: { id },
    select: { createdById: true, frequency: true, dayOfWeek: true, hour: true, minute: true, timezone: true, enabled: true },
  });
  if (!wf) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canManage(wf.createdById, userId))) {
    return NextResponse.json({ error: "Only the creator or an admin can edit this workflow" }, { status: 403 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const b = json as Record<string, unknown>;

  const data: Record<string, unknown> = {};

  if (b.title !== undefined) {
    data.title = String(b.title).trim().slice(0, MAX_TITLE) || "Untitled workflow";
  }
  if (b.body !== undefined) {
    const body = String(b.body).trim().slice(0, MAX_BODY);
    if (!body) return NextResponse.json({ error: "A message to post is required" }, { status: 400 });
    data.body = encryptMessage(body);
  }
  if (b.channelId !== undefined) {
    const channelId = String(b.channelId);
    const access = await checkChannelAccess(userId, channelId);
    if (!access.ok) return NextResponse.json({ error: "No access to that channel" }, { status: access.status });
    if (access.channel.archivedAt) return NextResponse.json({ error: "That channel is archived" }, { status: 400 });
    data.channelId = channelId;
  }

  // A schedule field present means re-parse the whole schedule (they're
  // interdependent — e.g. dayOfWeek only matters when WEEKLY).
  const touchesSchedule = ["frequency", "dayOfWeek", "hour", "minute", "timezone"].some((k) => b[k] !== undefined);
  let scheduleForNextRun = { frequency: wf.frequency, dayOfWeek: wf.dayOfWeek, hour: wf.hour, minute: wf.minute, timezone: wf.timezone };
  if (touchesSchedule) {
    const schedule = parseSchedule({
      frequency: b.frequency ?? wf.frequency,
      dayOfWeek: b.dayOfWeek ?? wf.dayOfWeek,
      hour: b.hour ?? wf.hour,
      minute: b.minute ?? wf.minute,
      timezone: b.timezone ?? wf.timezone,
    });
    if (!schedule) return NextResponse.json({ error: "Invalid schedule" }, { status: 400 });
    data.frequency = schedule.frequency;
    data.dayOfWeek = schedule.dayOfWeek;
    data.hour = schedule.hour;
    data.minute = schedule.minute;
    data.timezone = schedule.timezone;
    scheduleForNextRun = schedule;
  }

  const willBeEnabled = b.enabled === undefined ? wf.enabled : Boolean(b.enabled);
  if (b.enabled !== undefined) data.enabled = willBeEnabled;

  // Recompute the next fire if the schedule moved or it just got (re)enabled —
  // so a paused-then-resumed workflow doesn't fire on a stale past instant.
  const becameEnabled = willBeEnabled && !wf.enabled;
  if (willBeEnabled && (touchesSchedule || becameEnabled)) {
    data.nextRunAt = computeNextRun(scheduleForNextRun, new Date());
  }

  await prisma.workflow.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}

// DELETE /api/workflows/:id — creator or admin.
export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const wf = await prisma.workflow.findUnique({ where: { id }, select: { createdById: true } });
  if (!wf) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canManage(wf.createdById, userId))) {
    return NextResponse.json({ error: "Only the creator or an admin can delete this workflow" }, { status: 403 });
  }

  await prisma.workflow.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
