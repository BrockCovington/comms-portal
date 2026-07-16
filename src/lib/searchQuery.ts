// Parses a search string with operators into structured filters plus free
// text. Everything the operators touch (sender, channel, has-link/file, date)
// lives in unencrypted columns/relations, so the route can push those into the
// Prisma WHERE; only the free text needs the decrypt-and-match pass, since
// message bodies are encrypted with a random IV (no DB text index possible).
//
// Supported operators (all case-insensitive keys, repeatable):
//   from:@name  | from:name     sender name/email fragment
//   in:#channel | in:channel    channel-name fragment
//   has:link                    message has a link preview
//   has:file                    message has an attachment
//   on:YYYY-MM-DD               sent on that day (UTC)
//   after:YYYY-MM-DD            on/after that day (UTC, inclusive)
//   before:YYYY-MM-DD           before that day (UTC, exclusive)
//   on/after/before also accept "today" and "yesterday"
// Free text is AND-matched word-by-word; wrap in "double quotes" for a phrase.

export type ParsedSearch = {
  textTerms: string[]; // lowercased words/phrases, all must appear in the body
  text: string; // textTerms joined — for snippet highlighting + echo to the UI
  from: string[];
  channels: string[];
  hasLink: boolean;
  hasFile: boolean;
  after: Date | null; // inclusive lower bound (UTC)
  before: Date | null; // exclusive upper bound (UTC)
  hasFilters: boolean; // any operator/filter present (not just free text)
};

const OPERATOR = /^(from|in|has|on|after|before):(.*)$/i;

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addUtcDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

// A day-granularity date: YYYY-MM-DD (UTC), or the words today/yesterday.
function parseDay(value: string): Date | null {
  const v = value.trim().toLowerCase();
  if (v === "today") return startOfUtcDay(new Date());
  if (v === "yesterday") return addUtcDays(startOfUtcDay(new Date()), -1);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

// Split on whitespace, but keep "quoted phrases" together as one token.
function tokenize(input: string): { value: string; quoted: boolean }[] {
  const tokens: { value: string; quoted: boolean }[] = [];
  const re = /"([^"]+)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    if (m[1] !== undefined) tokens.push({ value: m[1], quoted: true });
    else tokens.push({ value: m[2], quoted: false });
  }
  return tokens;
}

export function parseSearchQuery(input: string): ParsedSearch {
  const from: string[] = [];
  const channels: string[] = [];
  const textTerms: string[] = [];
  let hasLink = false;
  let hasFile = false;
  let after: Date | null = null;
  let before: Date | null = null;

  const tightenAfter = (d: Date) => {
    after = after && after > d ? after : d;
  };
  const tightenBefore = (d: Date) => {
    before = before && before < d ? before : d;
  };

  for (const token of tokenize(input)) {
    const op = token.quoted ? null : OPERATOR.exec(token.value);
    if (!op) {
      const t = token.value.trim().toLowerCase();
      if (t) textTerms.push(t);
      continue;
    }

    const key = op[1].toLowerCase();
    const raw = op[2].trim();
    if (!raw) continue; // a bare "from:" with no value is just noise

    switch (key) {
      case "from":
        from.push(raw.replace(/^@/, ""));
        break;
      case "in":
        channels.push(raw.replace(/^#/, ""));
        break;
      case "has": {
        const v = raw.toLowerCase();
        if (v === "link") hasLink = true;
        else if (v === "file" || v === "attachment") hasFile = true;
        // Unknown has:* value — ignore rather than error.
        break;
      }
      case "on": {
        const day = parseDay(raw);
        if (day) {
          tightenAfter(day);
          tightenBefore(addUtcDays(day, 1));
        }
        break;
      }
      case "after": {
        const day = parseDay(raw);
        if (day) tightenAfter(day);
        break;
      }
      case "before": {
        const day = parseDay(raw);
        if (day) tightenBefore(day);
        break;
      }
    }
  }

  const hasFilters =
    from.length > 0 ||
    channels.length > 0 ||
    hasLink ||
    hasFile ||
    after !== null ||
    before !== null;

  return {
    textTerms,
    text: textTerms.join(" "),
    from,
    channels,
    hasLink,
    hasFile,
    after,
    before,
    hasFilters,
  };
}
