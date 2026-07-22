import { z } from "zod";

// A reaction is either a custom-emoji shortcode (":partyparrot:") or a raw
// unicode emoji grapheme. We can't cheaply enumerate every unicode emoji
// here, so instead we reject anything that's clearly NOT one: ASCII letters,
// digits, or whitespace (real emoji graphemes contain none of those), and
// cap the length so a grapheme cluster with modifiers still fits but prose
// can't sneak in. This replaced the old fixed 8-emoji allow-list.
const CUSTOM_SHORTCODE = /^:[a-z0-9_-]{2,32}:$/;
const NON_EMOJI_CHARS = /[a-zA-Z0-9\s]/;

// A mention target is either a real user id (cuid) or a broadcast token
// (@channel / @here / @everyone). The server expands the tokens to member ids
// at fan-out time (see src/lib/deliver.ts).
const mentionTarget = z.union([
  z.string().cuid(),
  z.enum(["@channel", "@here", "@everyone"]),
  // "@group:<cuid>" — a user-group mention, expanded to members at fan-out.
  z.string().regex(/^@group:[a-z0-9]{20,32}$/i),
]);

const GROUP_HANDLE = /^[a-z0-9][a-z0-9-]{1,29}$/;
export const createGroupSchema = z.object({
  handle: z.string().trim().toLowerCase().regex(GROUP_HANDLE, "Handle: lowercase letters, numbers and hyphens (2–30 chars)"),
  name: z.string().trim().min(1, "Name is required").max(50),
});
export const updateGroupSchema = z.object({
  handle: z.string().trim().toLowerCase().regex(GROUP_HANDLE, "Handle: lowercase letters, numbers and hyphens (2–30 chars)").optional(),
  name: z.string().trim().min(1).max(50).optional(),
});
export const setGroupMembersSchema = z.object({
  memberIds: z.array(z.string().cuid()).max(1000),
});

export const createChannelSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Channel name is required")
    .max(80, "Channel name is too long")
    // lowercase letters, numbers and hyphens — Slack-style channel names
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and hyphens only"),
  description: z.string().trim().max(280).optional(),
  isPrivate: z.boolean().optional().default(false),
});

export const postMessageSchema = z
  .object({
    // Optional now: a message can be file-only (Slack-style), text-only, or
    // both — but not neither, enforced by the refine below.
    body: z.string().trim().max(4000, "Message is too long").optional(),
    parentId: z.string().cuid().optional(),
    attachmentIds: z.array(z.string().cuid()).max(5, "Up to 5 files per message").optional(),
    // Client-computed (see MessageComposer's use of splitMentions), server
    // re-validates against real channel membership before notifying anyone.
    mentionedUserIds: z.array(mentionTarget).max(25).optional(),
  })
  .refine((data) => !!data.body?.length || !!data.attachmentIds?.length, {
    message: "Message can't be empty",
  });

export const scheduleMessageSchema = z
  .object({
    body: z.string().trim().max(4000, "Message is too long").optional(),
    sendAt: z.string().datetime("Invalid send time"),
    parentId: z.string().cuid().optional(),
    attachmentIds: z.array(z.string().cuid()).max(5, "Up to 5 files per message").optional(),
    mentionedUserIds: z.array(mentionTarget).max(25).optional(),
  })
  .refine((data) => !!data.body?.length || !!data.attachmentIds?.length, {
    message: "Message can't be empty",
  });

export const editMessageSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Message can't be empty")
    .max(4000, "Message is too long"),
});

export const startDmSchema = z.object({
  userId: z.string().cuid(),
});

export const addChannelMemberSchema = z.object({
  userId: z.string().cuid(),
});

export const toggleReactionSchema = z.object({
  emoji: z
    .string()
    .min(1)
    .max(64)
    .refine((v) => CUSTOM_SHORTCODE.test(v) || (v.length <= 16 && !NON_EMOJI_CHARS.test(v)), {
      message: "Invalid emoji",
    }),
});

// A single reaction token — same rule as toggleReactionSchema.emoji, reused
// for the huddle quick-reaction set below.
export const reactionTokenSchema = z
  .string()
  .min(1)
  .max(64)
  .refine((v) => CUSTOM_SHORTCODE.test(v) || (v.length <= 16 && !NON_EMOJI_CHARS.test(v)), {
    message: "Invalid emoji",
  });

// The customizable huddle quick-reaction set (the "main 8").
export const huddleReactionsSchema = z.object({
  reactions: z.array(reactionTokenSchema).min(1).max(8),
});

// Custom status: an emoji token (unicode or :name:), short text, and an
// optional auto-clear time. At least one of emoji/text should be present for
// the status to be meaningful (enforced in the route).
export const statusSchema = z.object({
  emoji: reactionTokenSchema.nullable().optional(),
  text: z.string().trim().max(100).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

export const updateRoleSchema = z.object({
  role: z.enum(["EMPLOYEE", "ADMIN"]),
});

export type CreateChannelInput = z.infer<typeof createChannelSchema>;
export type PostMessageInput = z.infer<typeof postMessageSchema>;
export type EditMessageInput = z.infer<typeof editMessageSchema>;
export type StartDmInput = z.infer<typeof startDmSchema>;
export type AddChannelMemberInput = z.infer<typeof addChannelMemberSchema>;
export type ToggleReactionInput = z.infer<typeof toggleReactionSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
