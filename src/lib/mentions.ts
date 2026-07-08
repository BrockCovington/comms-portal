export type MentionFragment = { text: string; isMention: boolean };

// Splits message text around @Name mentions, matched against the *actual
// current channel members* (not a generic "@Capitalized Words" guess) so
// rendering never highlights something that isn't really a member. Longest
// names first so "Marcus Chen" matches whole rather than stopping at "Marcus".
export function splitMentions(text: string, memberNames: string[]): MentionFragment[] {
  const names = memberNames.filter(Boolean).sort((a, b) => b.length - a.length);
  if (names.length === 0) return [{ text, isMention: false }];

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
