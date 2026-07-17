"use client";

import { useCustomEmoji } from "@/components/CustomEmojiContext";

// Renders a reaction/emoji token: a ":name:" custom emoji as its image, or a
// raw unicode grapheme as text (inheriting the surrounding font size). Shared
// by the huddle quick-react picker, the floating huddle reactions, and the
// customization editor so custom emoji show consistently everywhere.
export function EmojiToken({
  token,
  imgClassName = "inline-block h-5 w-5 object-contain align-text-bottom",
}: {
  token: string;
  imgClassName?: string;
}) {
  const { byName } = useCustomEmoji();
  const custom =
    token.startsWith(":") && token.endsWith(":") ? byName.get(token.slice(1, -1)) : undefined;
  if (custom) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={custom} alt={token} className={imgClassName} />;
  }
  return <>{token}</>;
}
