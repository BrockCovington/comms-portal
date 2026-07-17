import { Avatar } from "@/components/Avatar";
import { HeadphonesIcon } from "@/components/RailIcons";
import type { HuddleParticipant } from "@/hooks/useHuddleRoster";

// The "someone's in a huddle here" indicator shown on a sidebar channel/DM row:
// up to two stacked participant avatars plus a small headphones + count pill,
// matching Slack. Renders nothing when the huddle is empty.
export function HuddleBadge({
  participants,
  className = "",
}: {
  participants: HuddleParticipant[] | undefined;
  className?: string;
}) {
  if (!participants || participants.length === 0) return null;
  const shown = participants.slice(0, 2);
  const names = participants.map((p) => p.name ?? "Someone").join(", ");

  return (
    <span
      className={`flex shrink-0 items-center gap-1 ${className}`}
      title={`In a huddle: ${names}`}
    >
      <span className="flex -space-x-1.5">
        {shown.map((p) => (
          <Avatar
            key={p.id}
            name={p.name}
            image={p.image}
            size={16}
            variant="solid"
            className="ring-1 ring-[var(--color-sidebar)]"
          />
        ))}
      </span>
      <span className="flex items-center gap-0.5 rounded-full bg-green-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
        <HeadphonesIcon className="h-3 w-3" />
        {participants.length}
      </span>
    </span>
  );
}
