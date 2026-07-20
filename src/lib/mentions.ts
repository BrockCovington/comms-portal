export type MentionFragment = { text: string; isMention: boolean };

// Broadcast mentions (Slack-style): notify a group rather than one person.
//   @channel / @everyone → everyone in the channel
//   @here                → members currently active in the channel
export const BROADCAST_MENTIONS = ["channel", "here", "everyone"] as const;
export type BroadcastMention = (typeof BROADCAST_MENTIONS)[number];

// Splits message text around @Name mentions, matched against the *actual
// current channel members* (not a generic "@Capitalized Words" guess) so
// rendering never highlights something that isn't really a member. The three
// broadcast keywords (@channel/@here/@everyone) are always recognized too.
// Longest names first so "Marcus Chen" matches whole rather than stopping at
// "Marcus".
export function splitMentions(text: string, memberNames: string[]): MentionFragment[] {
  const names = [...memberNames.filter(Boolean), ...BROADCAST_MENTIONS].sort(
    (a, b) => b.length - a.length
  );

  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`@(${escaped.join("|")})\\b`, "g");

  const fragments: MentionFragment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) {
      fragments.push({ text: text.slice(lastIndex, match.index), isMention: false });
    }
    fragments.push({ text: match[0], isMention: true });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    fragments.push({ text: text.slice(lastIndex), isMention: false });
  }
  return fragments;
}

// The distinct broadcast tokens present in `text`, as "@channel"-style strings.
// Used by the composer to include them in a message's mentionedUserIds so the
// server can fan the notification out to the whole channel (or those present).
export function extractBroadcastMentions(text: string): string[] {
  const found = new Set<string>();
  const re = /(?:^|\s)@(channel|here|everyone)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) found.add(`@${m[1]}`);
  return [...found];
}
