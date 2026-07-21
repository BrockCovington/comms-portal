// Slash commands available from the message composer. "transform" commands
// rewrite the message and post it; "action" commands do something (set status,
// toggle Do Not Disturb) instead of posting. The composer renders SLASH_COMMANDS
// as an autocomplete and routes a matching leading "/command" through here.
export type SlashKind = "transform" | "action";
export type SlashCommand = { name: string; args: string; description: string; kind: SlashKind };

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: "shrug", args: "[message]", description: "Append ¯\\_(ツ)_/¯ to your message", kind: "transform" },
  { name: "me", args: "<action>", description: "Post an italicized action", kind: "transform" },
  { name: "status", args: "<text> | clear", description: "Set or clear your status", kind: "action" },
  { name: "dnd", args: "[off]", description: "Pause notifications (focus); “/dnd off” to resume", kind: "action" },
];

export function findCommand(name: string): SlashCommand | undefined {
  return SLASH_COMMANDS.find((c) => c.name === name.toLowerCase());
}

// If `body` begins with a *known* slash command, return it plus the remaining
// text. Unknown leading slashes (e.g. a path like "/etc/hosts") return null so
// they post as ordinary text.
export function parseCommand(body: string): { command: SlashCommand; rest: string } | null {
  const m = /^\/(\w+)(?:\s+([\s\S]*))?$/.exec(body.trim());
  if (!m) return null;
  const command = findCommand(m[1]);
  if (!command) return null;
  return { command, rest: (m[2] ?? "").trim() };
}
