// Recurring "quiet hours" (notification schedule). During the window,
// live notification pushes are suppressed; the notifications still land in
// Activity. Pure + dependency-free so it's easy to unit-test and safe to run
// anywhere (server fan-out or client preview).

export type QuietHours = {
  quietHoursEnabled: boolean;
  quietStartMinute: number; // minutes from local midnight, 0–1439
  quietEndMinute: number;
  quietTimezone: string; // IANA name
};

// The minutes-from-midnight wall-clock time in `tz` for a given instant.
function minutesOfDayInTz(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
}

// Is `at` inside the user's quiet window? Handles windows that wrap past
// midnight (start > end, e.g. 22:00 → 08:00). A start === end window is treated
// as "never" (zero-length), matching Slack's behavior. Invalid timezones fall
// back to no-suppression rather than throwing.
export function isQuietNow(pref: QuietHours, at: Date = new Date()): boolean {
  if (!pref.quietHoursEnabled) return false;
  const { quietStartMinute: start, quietEndMinute: end } = pref;
  if (start === end) return false;
  let nowMin: number;
  try {
    nowMin = minutesOfDayInTz(pref.quietTimezone, at);
  } catch {
    return false;
  }
  if (start < end) {
    // Same-day window, e.g. 09:00 → 17:00.
    return nowMin >= start && nowMin < end;
  }
  // Wraps midnight, e.g. 22:00 → 08:00.
  return nowMin >= start || nowMin < end;
}

// "22:00" ⇄ minutes helpers for the settings UI / API.
export function minutesToHHMM(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function hhmmToMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}
