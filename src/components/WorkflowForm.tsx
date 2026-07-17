"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { TrashIcon } from "@/components/RailIcons";

type Frequency = "DAILY" | "WEEKDAYS" | "WEEKLY";
type Channel = { id: string; name: string; isDm: boolean };

type Initial = {
  id: string;
  title: string;
  body: string;
  channelId: string;
  channelName: string;
  frequency: Frequency;
  dayOfWeek: number | null;
  hour: number;
  minute: number;
  timezone: string;
  enabled: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  runCount: number;
  canManage: boolean;
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// A small curated set of common IANA zones; the viewer's detected zone is
// always folded in so it's selectable even if it's not on the list.
const COMMON_ZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "UTC",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

function detectedZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function WorkflowForm({ workflowId }: { workflowId?: string }) {
  const router = useRouter();
  const editing = !!workflowId;

  const [loading, setLoading] = useState(editing);
  const [notFound, setNotFound] = useState(false);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [initial, setInitial] = useState<Initial | null>(null);
  const [canManage, setCanManage] = useState(true);

  const [title, setTitle] = useState("");
  const [channelId, setChannelId] = useState("");
  const [body, setBody] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("WEEKDAYS");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);
  const [timezone, setTimezone] = useState("UTC");
  const [enabled, setEnabled] = useState(true);

  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Load channels the user can post to (exclude DMs — workflows target
  // channels), plus the workflow itself when editing.
  useEffect(() => {
    fetch("/api/channels", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { channels: [] }))
      .then((d) => setChannels((d.channels ?? []).filter((c: Channel) => !c.isDm)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!editing) {
      setTimezone(detectedZone());
      return;
    }
    fetch(`/api/workflows/${workflowId}`, { cache: "no-store" })
      .then((r) => (r.status === 404 ? (setNotFound(true), null) : r.ok ? r.json() : null))
      .then((d: Initial | null) => {
        if (!d) return;
        setInitial(d);
        setCanManage(d.canManage);
        setTitle(d.title);
        setChannelId(d.channelId);
        setBody(d.body);
        setFrequency(d.frequency);
        setDayOfWeek(d.dayOfWeek ?? 1);
        setHour(d.hour);
        setMinute(d.minute);
        setTimezone(d.timezone);
        setEnabled(d.enabled);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [editing, workflowId]);

  const zoneOptions = useMemo(() => {
    const set = new Set(COMMON_ZONES);
    if (timezone) set.add(timezone);
    return Array.from(set);
  }, [timezone]);

  const timeValue = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

  function payload() {
    return {
      title: title.trim() || "Untitled workflow",
      channelId,
      body: body.trim(),
      frequency,
      dayOfWeek: frequency === "WEEKLY" ? dayOfWeek : undefined,
      hour,
      minute,
      timezone,
      enabled,
    };
  }

  async function save() {
    setError(null);
    setNotice(null);
    if (!channelId) return setError("Pick a channel to post to.");
    if (!body.trim()) return setError("Write the message the workflow should post.");
    setSaving(true);
    try {
      const res = await fetch(editing ? `/api/workflows/${workflowId}` : "/api/workflows", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data.error ?? "Couldn't save the workflow.");
      if (editing) {
        setNotice("Saved.");
        router.refresh();
      } else {
        router.push("/workflows");
      }
    } finally {
      setSaving(false);
    }
  }

  async function runNow() {
    if (!workflowId) return;
    setError(null);
    setNotice(null);
    setRunning(true);
    try {
      const res = await fetch(`/api/workflows/${workflowId}/run`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data.error ?? "Couldn't run the workflow.");
      setNotice("Posted to the channel now.");
    } finally {
      setRunning(false);
    }
  }

  async function remove() {
    if (!workflowId) return;
    if (!window.confirm("Delete this workflow? It will stop posting. This can't be undone.")) return;
    const res = await fetch(`/api/workflows/${workflowId}`, { method: "DELETE" });
    if (res.ok) router.push("/workflows");
  }

  if (loading) return <p className="text-sm text-[var(--color-ink-soft)]">Loading…</p>;
  if (notFound) return <p className="text-sm text-[var(--color-ink-soft)]">This workflow doesn&apos;t exist.</p>;

  const readOnly = editing && !canManage;

  return (
    <div className="space-y-5">
      {readOnly && (
        <p className="rounded-md bg-[var(--color-accent-soft)] px-3 py-2 text-xs text-[var(--color-ink-soft)]">
          Only the creator or an admin can edit this workflow.
        </p>
      )}

      <Field label="Name">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={readOnly}
          placeholder="e.g. Monday standup nudge"
          className={inputClass}
        />
      </Field>

      <Field label="Post to channel">
        <select value={channelId} onChange={(e) => setChannelId(e.target.value)} disabled={readOnly} className={inputClass}>
          <option value="">Select a channel…</option>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              #{c.name}
            </option>
          ))}
          {/* Keep the current channel selectable even if it's private and not in
              the fetched list for some reason. */}
          {editing && initial && !channels.some((c) => c.id === initial.channelId) && (
            <option value={initial.channelId}>#{initial.channelName}</option>
          )}
        </select>
      </Field>

      <Field label="Message to post">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={readOnly}
          rows={4}
          placeholder="What should this workflow post each time it runs?"
          className={`${inputClass} resize-y`}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Repeat">
          <select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)} disabled={readOnly} className={inputClass}>
            <option value="DAILY">Every day</option>
            <option value="WEEKDAYS">Every weekday (Mon–Fri)</option>
            <option value="WEEKLY">Weekly</option>
          </select>
        </Field>

        {frequency === "WEEKLY" && (
          <Field label="On">
            <select value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))} disabled={readOnly} className={inputClass}>
              {WEEKDAYS.map((d, i) => (
                <option key={i} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="At">
          <input
            type="time"
            value={timeValue}
            onChange={(e) => {
              const [h, m] = e.target.value.split(":").map(Number);
              if (!Number.isNaN(h)) setHour(h);
              if (!Number.isNaN(m)) setMinute(m);
            }}
            disabled={readOnly}
            className={inputClass}
          />
        </Field>

        <Field label="Timezone">
          <select value={timezone} onChange={(e) => setTimezone(e.target.value)} disabled={readOnly} className={inputClass}>
            {zoneOptions.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm text-[var(--color-ink)]">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} disabled={readOnly} className="h-4 w-4" />
        Enabled {enabled ? "" : "(paused — won't post automatically)"}
      </label>

      {editing && initial && (
        <div className="rounded-md border border-[var(--color-line)] bg-[var(--color-canvas)] px-3 py-2 text-xs text-[var(--color-ink-soft)]">
          Next run: <span className="font-medium text-[var(--color-ink)]">{enabled ? fmt(initial.nextRunAt) : "paused"}</span>
          {" · "}Last run: <span className="font-medium text-[var(--color-ink)]">{fmt(initial.lastRunAt)}</span>
          {" · "}Ran {initial.runCount} {initial.runCount === 1 ? "time" : "times"}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-[var(--color-accent)]">{notice}</p>}

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : editing ? "Save changes" : "Create workflow"}
          </button>
          {editing && (
            <>
              <button
                onClick={runNow}
                disabled={running}
                className="rounded-md border border-[var(--color-line)] px-4 py-2 text-sm font-medium text-[var(--color-ink)] hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
              >
                {running ? "Posting…" : "Run now"}
              </button>
              <button
                onClick={remove}
                className="ml-auto flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-[var(--color-ink-soft)] hover:bg-red-50 hover:text-red-600"
              >
                <TrashIcon className="h-4 w-4" /> Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-[var(--color-line)] bg-transparent px-3 py-2 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)] disabled:opacity-60";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">{label}</span>
      {children}
    </label>
  );
}
