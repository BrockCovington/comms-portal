import { z } from "zod";

// A reaction is either a custom-emoji shortcode (":partyparrot:") or a raw
// unicode emoji grapheme. We can't cheaply enumerate every unicode emoji
// here, so instead we reject anything that's clearly NOT one: ASCII letters,
// digits, or whitespace (real emoji graphemes contain none of those), and
// cap the length so a grapheme cluster with modifiers still fits but prose
// can't sneak in. This replaced the old fixed 8-emoji allow-list.
const CUSTOM_SHORTCODE = /^:[a-z0-9_-]{2,32}:$/;
const NON_EMOJI_CHARS = /[a-zA-Z0-9\s]/;

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
    mentionedUserIds: z.array(z.string().cuid()).max(20).optional(),
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
    mentionedUserIds: z.array(z.string().cuid()).max(20).optional(),
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
