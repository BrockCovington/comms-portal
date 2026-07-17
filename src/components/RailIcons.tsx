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
