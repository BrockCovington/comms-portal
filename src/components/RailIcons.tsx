// Minimalist line icons for the left rail — monochrome, Slack-style. They draw
// with `currentColor`, so the rail's text color (which varies per theme /
// active state) flows straight through and they work in every color scheme
// automatically. 24×24 grid, ~1.75 stroke.

type IconProps = { className?: string };

function Line({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "h-6 w-6"}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M3.5 10.5 12 3.5l8.5 7" />
      <path d="M5.5 9.5V20h13V9.5" />
      <path d="M10 20v-5h4v5" />
    </Line>
  );
}

export function DmsIcon(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M4 5.5h16v10H9l-4 3.5v-3.5H4z" />
    </Line>
  );
}

export function ActivityIcon(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M6 10a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6z" />
      <path d="M10 20a2.2 2.2 0 0 0 4 0" />
    </Line>
  );
}

export function LaterIcon(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M6.5 4h11v16l-5.5-3.75L6.5 20z" />
    </Line>
  );
}

export function FilesIcon(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M4 6.5A1.5 1.5 0 0 1 5.5 5h4l2 2h7A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5z" />
    </Line>
  );
}

export function ToolsIcon(props: IconProps) {
  return (
    <Line {...props}>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M12 2.6v2.6M12 18.8v2.6M21.4 12h-2.6M5.2 12H2.6M18.6 5.4l-1.9 1.9M7.3 16.7l-1.9 1.9M18.6 18.6l-1.9-1.9M7.3 7.3 5.4 5.4" />
    </Line>
  );
}

export function GearIcon(props: IconProps) {
  return (
    <Line {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Line>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M20 13.5A8 8 0 1 1 10.5 4a6.5 6.5 0 0 0 9.5 9.5z" />
    </Line>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M12 5v14M5 12h14" />
    </Line>
  );
}

export function StarIcon(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L4.5 9.7l5.9-.8z" />
    </Line>
  );
}

export function StarFilledIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className ?? "h-6 w-6"} aria-hidden="true">
      <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L4.5 9.7l5.9-.8z" />
    </svg>
  );
}

export function HeadphonesIcon(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M5 13v-1a7 7 0 0 1 14 0v1" />
      <rect x="3.5" y="13" width="3.5" height="6" rx="1.25" />
      <rect x="17" y="13" width="3.5" height="6" rx="1.25" />
    </Line>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M6 10a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6z" />
      <path d="M10 20a2.2 2.2 0 0 0 4 0" />
    </Line>
  );
}

export function BellOffIcon(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M6 10a6 6 0 0 1 9.5-4.85M18 12c0 4 1.5 5.5 2 6H8" />
      <path d="M10 20a2.2 2.2 0 0 0 4 0" />
      <path d="M3.5 3.5l17 17" />
    </Line>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Line {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2" />
    </Line>
  );
}

// Vertical three-dot "more" (kebab), distinct from the horizontal MoreIcon.
export function KebabIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className ?? "h-6 w-6"} aria-hidden="true">
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  );
}

export function PinIcon(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M9 4h6l-1 6 3 3H7l3-3-1-6z" />
      <path d="M12 16v4" />
    </Line>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <Line {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M17.5 19a5.5 5.5 0 0 0-2.5-4.6" />
    </Line>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </Line>
  );
}

export function ArchiveIcon(props: IconProps) {
  return (
    <Line {...props}>
      <rect x="3.5" y="5" width="17" height="4" rx="1" />
      <path d="M5 9v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9" />
      <path d="M10 13h4" />
    </Line>
  );
}

// --- Message hover-action icons ---

export function ThreadIcon(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M4 5.5h16v9H9l-4 3.5v-3.5H4z" />
      <path d="M7.5 8.5h9M7.5 11h5" />
    </Line>
  );
}

export function ForwardIcon(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M13 6l6 5-6 5" />
      <path d="M19 11H8.5A4.5 4.5 0 0 0 4 15.5V18" />
    </Line>
  );
}

// A smiley with a small "+" — "find another reaction".
export function ReactionIcon(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M20.5 11.5a8 8 0 1 1-8-8" />
      <path d="M9 10.5v.5M14.5 10.5v.5" />
      <path d="M8.8 14a3.2 3.2 0 0 0 5 0" />
      <path d="M18.5 3.5v3.6M16.7 5.3h3.6" />
    </Line>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M4 20h4L18.5 9.5a2 2 0 0 0-3-3L5 17z" />
      <path d="M13.5 6.5l3 3" />
    </Line>
  );
}

export function LinkIcon(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M10 13a3 3 0 0 0 4.5.4l2.5-2.5a3 3 0 0 0-4.2-4.2l-1.3 1.2" />
      <path d="M14 11a3 3 0 0 0-4.5-.4L7 13.1a3 3 0 0 0 4.2 4.2l1.3-1.2" />
    </Line>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <Line {...props}>
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </Line>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M6.5 7l.8 12a1 1 0 0 0 1 1h7.4a1 1 0 0 0 1-1l.8-12" />
      <path d="M10 11v6M14 11v6" />
    </Line>
  );
}

// --- Create-menu icons ---

export function HashIcon(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M9 4L7 20M17 4l-2 16M4 9.5h16M3 14.5h16" />
    </Line>
  );
}

export function CanvasIcon(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M6 4h8l4 4v12H6z" />
      <path d="M14 4v4h4" />
      <path d="M9 13h6M9 16h4" />
    </Line>
  );
}

export function ListIcon(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M3.5 5.5l1 1 1.6-1.8M3.5 11.5l1 1 1.6-1.8M3.5 17.5l1 1 1.6-1.8" />
    </Line>
  );
}

export function WorkflowIcon(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M8 5l11 7-11 7z" />
    </Line>
  );
}

export function InvitePeopleIcon(props: IconProps) {
  return (
    <Line {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M18 8.5v5M15.5 11h5" />
    </Line>
  );
}

// Filled dots — reads cleaner than stroked circles at this size.
export function MoreIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className ?? "h-6 w-6"} aria-hidden="true">
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  );
}
