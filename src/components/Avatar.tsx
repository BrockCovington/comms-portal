/* eslint-disable @next/next/no-img-element */

// Shared avatar: renders the user's picture when there is one, otherwise the
// first-initial fallback circle. Previously this markup was copy-pasted into
// ~7 components with slightly different sizes and colors — this centralizes
// it so an uploaded profile picture shows everywhere consistently.
//
// Dimensions come through inline styles (not Tailwind h-/w- classes) so a
// caller can pass any pixel size without fighting Tailwind's class purging.
export function Avatar({
  name,
  image,
  size = 32,
  shape = "circle",
  variant = "soft",
  className = "",
}: {
  name: string | null;
  image?: string | null;
  size?: number;
  shape?: "circle" | "square";
  variant?: "soft" | "solid";
  className?: string;
}) {
  const radius = shape === "circle" ? "rounded-full" : "rounded-md";
  const dims = { width: size, height: size };

  if (image) {
    return (
      <img
        src={image}
        alt={name ?? ""}
        style={dims}
        className={`shrink-0 object-cover ${radius} ${className}`}
      />
    );
  }

  const colors =
    variant === "solid"
      ? "bg-[var(--color-accent)] text-white"
      : "bg-[var(--color-accent-soft)] text-[var(--color-accent)]";

  return (
    <span
      aria-hidden="true"
      style={{ ...dims, fontSize: Math.max(10, Math.round(size * 0.42)) }}
      className={`inline-flex shrink-0 items-center justify-center font-semibold ${radius} ${colors} ${className}`}
    >
      {(name ?? "?").charAt(0).toUpperCase()}
    </span>
  );
}
