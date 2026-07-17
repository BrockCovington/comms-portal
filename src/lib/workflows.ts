import { prisma } from "@/lib/prisma";
import type { WorkflowFrequency } from "@prisma/client";

// ---------------------------------------------------------------------------
// Workflow scheduling. A workflow fires at a wall-clock time (hour:minute) in
// a given IANA timezone, on a recurrence (every day / weekdays / a weekday).
// We store the next fire as a UTC instant (`nextRunAt`) and recompute it every
// time the workflow fires or its schedule changes — so it stays correct across
// DST transitions without a library. All the math below is pure and depends
// only on the arguments passed in (safe to unit-test / run in any context).
// ---------------------------------------------------------------------------

export type Schedule = {
  frequency: WorkflowFrequency;
  dayOfWeek: number | null; // 0=Sun..6=Sat, used only when WEEKLY
  hour: number; // 0-23
  minute: number; // 0-59
  timezone: string; // IANA name, e.g. "America/New_York"
};

// The signed offset (ms) between a UTC instant and the same wall clock in `tz`,
// i.e. wallClock = utc + offset. Derived by asking Intl what the local clock
// reads at that instant and diffing against the instant itself.
function tzOffsetMs(tz: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, number> = {};
  for (const p of dtf.formatToParts(at)) {
    if (p.type !== "literal") map[p.type] = Number(p.value);
  }
  // en-US hour12:false renders midnight as "24" — normalize to 0.
  const asUTC = Date.UTC(map.year, map.month - 1, map.day, map.hour % 24, map.minute, map.second);
  return asUTC - at.getTime();
}

// The UTC instant at which the wall clock in `tz` reads the given Y/M/D H:M.
// Two passes settle DST boundaries (the offset used to convert can itself
// change across the very transition we're landing on).
function zonedWallToUtc(tz: string, year: number, month: number, day: number, hour: number, minute: number): Date {
  const guess = Date.UTC(year, month, day, hour, minute, 0);
  const offset1 = tzOffsetMs(tz, new Date(guess));
  let utc = guess - offset1;
  const offset2 = tzOffsetMs(tz, new Date(utc));
  if (offset2 !== offset1) utc = guess - offset2;
  return new Date(utc);
}

// The wall-clock calendar date (in `tz`) of a UTC instant.
function zonedDateParts(tz: string, at: Date): { year: number; month: number; day: number } {
  const offset = tzOffsetMs(tz, at);
  const local = new Date(at.getTime() + offset);
  return { year: local.getUTCFullYear(), month: local.getUTCMonth(), day: local.getUTCDate() };
}

function frequencyMatches(freq: WorkflowFrequency, dayOfWeek: number | null, weekday: number): boolean {
  switch (freq) {
    case "DAILY":
      return true;
    case "WEEKDAYS":
      return weekday >= 1 && weekday <= 5;
    case "WEEKLY":
      return weekday === dayOfWeek;
  }
}

// The first fire strictly after `after`. Walks forward day by day (in the
// workflow's own timezone) until it finds a matching weekday whose target
// wall-clock time lands in the future.
export function computeNextRun(schedule: Schedule, after: Date): Date {
  const { frequency, dayOfWeek, hour, minute, timezone } = schedule;
  const start = zonedDateParts(timezone, after);

  for (let addDays = 0; addDays <= 371; addDays++) {
    // Advance the calendar date in wall-clock terms (UTC arithmetic on a
    // date-only value avoids DST hour drift).
    const d = new Date(Date.UTC(start.year, start.month, start.day));
    d.setUTCDate(d.getUTCDate() + addDays);
    const weekday = d.getUTCDay();
    if (!frequencyMatches(frequency, dayOfWeek, weekday)) continue;

    const candidate = zonedWallToUtc(timezone, d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour, minute);
    if (candidate.getTime() > after.getTime()) return candidate;
  }
  // Unreachable for valid schedules (a weekly slot recurs within 7 days).
  return zonedWallToUtc(timezone, start.year, start.month, start.day, hour, minute);
}

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// A short human-readable label, e.g. "Weekly on Monday at 9:00 AM (America/New_York)".
export function describeSchedule(schedule: Schedule): string {
  const { frequency, dayOfWeek, hour, minute, timezone } = schedule;
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const ampm = hour < 12 ? "AM" : "PM";
  const time = `${h12}:${String(minute).padStart(2, "0")} ${ampm}`;
  let when: string;
  switch (frequency) {
    case "DAILY":
      when = "Every day";
      break;
    case "WEEKDAYS":
      when = "Every weekday (Mon–Fri)";
      break;
    case "WEEKLY":
      when = `Weekly on ${WEEKDAY_NAMES[dayOfWeek ?? 1]}`;
      break;
  }
  return `${when} at ${time} (${timezone})`;
}

export type WorkflowSummary = {
  id: string;
  title: string;
  channelName: string;
  channelIsDm: boolean;
  scheduleLabel: string;
  enabled: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  runCount: number;
  createdByName: string | null;
};

// All workflows in the workspace, newest-edited first — for the /workflows index.
export async function getWorkflowsForList(): Promise<WorkflowSummary[]> {
  const rows = await prisma.workflow.findMany({
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: {
      id: true,
      title: true,
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
  return rows.map((w) => ({
    id: w.id,
    title: w.title,
    channelName: w.channel.name,
    channelIsDm: w.channel.isDm,
    scheduleLabel: describeSchedule(w),
    enabled: w.enabled,
    nextRunAt: w.enabled ? w.nextRunAt.toISOString() : null,
    lastRunAt: w.lastRunAt?.toISOString() ?? null,
    runCount: w.runCount,
    createdByName: w.createdBy.name,
  }));
}

// Normalize + validate a schedule payload from a request body. Returns null on
// any invalid field so callers can 400 uniformly.
export function parseSchedule(input: {
  frequency?: unknown;
  dayOfWeek?: unknown;
  hour?: unknown;
  minute?: unknown;
  timezone?: unknown;
}): Schedule | null {
  const freq = input.frequency;
  if (freq !== "DAILY" && freq !== "WEEKDAYS" && freq !== "WEEKLY") return null;

  const hour = Number(input.hour);
  const minute = Number(input.minute);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;

  let dayOfWeek: number | null = null;
  if (freq === "WEEKLY") {
    const dow = Number(input.dayOfWeek);
    if (!Number.isInteger(dow) || dow < 0 || dow > 6) return null;
    dayOfWeek = dow;
  }

  const timezone = String(input.timezone ?? "").trim();
  if (!timezone) return null;
  // Reject a bogus timezone up front rather than storing something Intl chokes
  // on at fire time.
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    return null;
  }

  return { frequency: freq, dayOfWeek, hour, minute, timezone };
}
