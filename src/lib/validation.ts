import { z } from "zod";
import { REACTION_EMOJIS } from "@/lib/reactions";

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
  emoji: z.enum(REACTION_EMOJIS),
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
