"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMobileNav } from "@/components/MobileNavContext";
import { MenuIcon } from "@/components/RailIcons";
import { WorkflowForm } from "@/components/WorkflowForm";

export default function WorkflowDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { setOpen } = useMobileNav();
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
        <Link href="/workflows" className="text-sm text-[var(--color-ink-soft)] hover:text-[var(--color-accent)]">
          Workflows
        </Link>
        <span className="text-[var(--color-ink-soft)]">/</span>
        <span className="text-sm font-semibold text-[var(--color-ink)]">Edit workflow</span>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-6">
        <div className="mx-auto max-w-2xl">
          <WorkflowForm workflowId={id} />
        </div>
      </div>
    </div>
  );
}
