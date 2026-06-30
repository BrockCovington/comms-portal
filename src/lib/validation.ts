import { z } from "zod";

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

export const postMessageSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Message can't be empty")
    .max(4000, "Message is too long"),
  parentId: z.string().cuid().optional(),
});

export type CreateChannelInput = z.infer<typeof createChannelSchema>;
export type PostMessageInput = z.infer<typeof postMessageSchema>;
