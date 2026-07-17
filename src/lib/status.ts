// Prisma select fragment for a user's custom status — spread into any
// `user: { select: { ... } }` so the status emoji can render next to their
// name. Kept in one place so the shape stays consistent everywhere.
export const STATUS_SELECT = {
  statusEmoji: true,
  statusText: true,
  statusExpiresAt: true,
} as const;

// The status fields as they appear on a rendered user object. Optional so a
// payload that hasn't been plumbed yet still type-checks (StatusBadge just
// renders nothing).
export type UserStatusFields = {
  statusEmoji?: string | null;
  statusText?: string | null;
  statusExpiresAt?: string | Date | null;
};
