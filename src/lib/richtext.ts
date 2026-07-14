import { splitMentions } from "@/lib/mentions";
import { findEmoji } from "@/lib/emoji";

// Layered on top of splitMentions rather than replacing it — mentions are
// resolved first (against real member names, exactly as MessageRow already
// does), then each non-mention run is scanned for inline formatting. This
// keeps existing @mention highlighting untouched; richtext.ts only adds to
// it. Scoped narrowly to what's visible in the reference screenshot: bold,
// italic, inline code, bullet lists, and :shortcode: emoji — no tables,
// headers, or markdown-style links.

export type RichSegment =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "italic"; text: string }
  | { kind: "code"; text: string }
  | { kind: "mention"; text: string }
  | { kind: "customEmoji"; text: string; url: string };

export type RichBlock =
  | { type: "text"; lines: RichSegment[][] }
  | { type: "bullet"; items: RichSegment[][] };

// Order matters: "**bold**" must be checked before "*italic*" so a bold
// run isn't misread as two adjacent italics. The :shortcode: group matches
// any :word: — findEmoji() decides at substitution time whether it's a
// known emoji or just literal text containing colons, so an unrecognized
// shortcode like ":not_a_real_emoji:" round-trips unchanged instead of
// vanishing.
const INLINE_PATTERN = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|:([a-z0-9_+-]+):/gi;

function splitInline(text: string, customEmoji?: Map<string, string>): RichSegment[] {
  const segments: RichSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INLINE_PATTERN.exec(text))) {
    if (match.index > lastIndex) {
      segments.push({ kind: "text", text: text.slice(lastIndex, match.index) });
    }
    if (match[1] !== undefined) segments.push({ kind: "bold", text: match[1] });
    else if (match[2] !== undefined) segments.push({ kind: "italic", text: match[2] });
    else if (match[3] !== undefined) segments.push({ kind: "code", text: match[3] });
    else if (match[4] !== undefined) {
      // Resolution order: built-in unicode shortcode, then a custom
      // workspace emoji, then leave the raw ":name:" text untouched.
      const unicode = findEmoji(match[4]);
      const customUrl = customEmoji?.get(match[4].toLowerCase());
      if (unicode) segments.push({ kind: "text", text: unicode });
      else if (customUrl) segments.push({ kind: "customEmoji", text: match[0], url: customUrl });
      else segments.push({ kind: "text", text: match[0] });
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ kind: "text", text: text.slice(lastIndex) });
  }
  return segments;
}

function splitSegments(
  text: string,
  memberNames: string[],
  customEmoji?: Map<string, string>
): RichSegment[] {
  const mentionFragments = splitMentions(text, memberNames);
  const segments: RichSegment[] = [];
  for (const fragment of mentionFragments) {
    if (fragment.isMention) {
      segments.push({ kind: "mention", text: fragment.text });
    } else {
      segments.push(...splitInline(fragment.text, customEmoji));
    }
  }
  return segments;
}

const BULLET_PATTERN = /^[-*]\s+/;

// Groups consecutive bullet lines ("- "/"* " prefixed) into one bullet
// block, and consecutive plain lines into one text block (rendered with a
// line break between them, so multi-line plain text still reads as one
// paragraph rather than one <p> per line).
export function renderRichText(
  body: string,
  memberNames: string[],
  customEmoji?: Map<string, string>
): RichBlock[] {
  const lines = body.split("\n");
  const blocks: RichBlock[] = [];

  for (const line of lines) {
    const isBullet = BULLET_PATTERN.test(line);
    const segments = splitSegments(
      isBullet ? line.replace(BULLET_PATTERN, "") : line,
      memberNames,
      customEmoji
    );
    const last = blocks[blocks.length - 1];

    if (isBullet) {
      if (last?.type === "bullet") last.items.push(segments);
      else blocks.push({ type: "bullet", items: [segments] });
    } else {
      if (last?.type === "text") last.lines.push(segments);
      else blocks.push({ type: "text", lines: [segments] });
    }
  }

  return blocks;
}
