import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { getChannelsWithUnread } from "@/lib/channels";

export default async function UnreadsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const channels = await getChannelsWithUnread(session.user.id);
  const unread = channels.filter((c) => c.hasUnread);

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="text-lg font-semibold text-[var(--color-ink)]">Unreads</h1>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
        Channels and direct messages with new activity.
      </p>

      {unread.length === 0 ? (
        <p className="mt-8 text-sm text-[var(--color-ink-soft)]">You're all caught up.</p>
      ) : (
        <ul className="mt-6 divide-y divide-[var(--color-line)] rounded-md border border-[var(--color-line)]">
          {unread.map((c) => (
            <li key={c.id}>
              <Link
                href={`/c/${c.id}`}
                className="flex items-center gap-2 px-4 py-3 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-accent-soft)]"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-accent)]" />
                {c.isDm ? "" : "#"}
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
