"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMobileNav } from "@/components/MobileNavContext";
import { MenuIcon } from "@/components/RailIcons";

const TABS = [
  { href: "/admin/users", label: "Members & roles" },
  { href: "/admin/channels", label: "Channels" },
];

// Shared chrome for the dedicated admin pages: a sticky header with a sub-nav
// between the admin tools, and a scrollable body (the old single dashboard
// overflowed the viewport with no scroll container — this fixes that).
export function AdminShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const { setOpen } = useMobileNav();
  const pathname = usePathname();

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
        <h1 className="text-base font-semibold text-[var(--color-pink,var(--color-ink))]">Admin</h1>
        <nav className="ml-3 flex items-center gap-1">
          {TABS.map((t) => {
            const active = pathname === t.href;
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`rounded-md px-3 py-1.5 text-sm transition ${
                  active
                    ? "bg-[var(--color-accent-soft)] font-medium text-[var(--color-accent)]"
                    : "text-[var(--color-ink-soft)] hover:bg-[var(--color-accent-soft)]"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-6">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-lg font-semibold text-[var(--color-ink)]">{title}</h2>
          {description && <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{description}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
