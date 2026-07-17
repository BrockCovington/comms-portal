"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMobileNav } from "@/components/MobileNavContext";
import { MenuIcon, PlusIcon, WorkflowIcon } from "@/components/RailIcons";

type WorkflowSummary = {
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

function fmtNext(iso: string | null): string {
  if (!iso) return "paused";
  return new Date(iso).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function WorkflowsIndexPage() {
  const { setOpen } = useMobileNav();
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/workflows", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { workflows: [] }))
      .then((d) => setWorkflows(d.workflows ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[var(--color-line)] px-5">
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="-ml-1 rounded p-1.5 text-[var(--color-ink-soft)] hover:bg-[var(--color-accent-soft)] md:hidden"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
        <h1 className="text-base font-semibold text-[var(--color-pink,var(--color-ink))]">Workflows</h1>
        <Link
          href="/workflows/new"
          className="ml-auto flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
        >
          <PlusIcon className="h-4 w-4" /> New workflow
        </Link>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="mx-auto max-w-2xl">
          {loading ? (
            <p className="text-sm text-[var(--color-ink-soft)]">Loading…</p>
          ) : workflows.length === 0 ? (
            <p className="text-sm text-[var(--color-ink-soft)]">
              No workflows yet. Create one to automatically post a message to a channel on a schedule.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {workflows.map((w) => (
                <li key={w.id}>
                  <Link
                    href={`/workflows/${w.id}`}
                    className="flex items-center gap-3 rounded-md border border-[var(--color-line)] px-3 py-2.5 hover:bg-[var(--color-accent-soft)]"
                  >
                    <span className={w.enabled ? "text-[var(--color-accent)]" : "text-[var(--color-ink-soft)]"}>
                      <WorkflowIcon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-[var(--color-ink)]">{w.title}</span>
                        {!w.enabled && (
                          <span className="rounded bg-[var(--color-accent-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-ink-soft)]">
                            Paused
                          </span>
                        )}
                      </span>
                      <span className="block truncate text-xs text-[var(--color-ink-soft)]">
                        #{w.channelName} · {w.scheduleLabel} · next {fmtNext(w.nextRunAt)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
