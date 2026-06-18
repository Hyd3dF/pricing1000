import { z } from "zod";

export const createRoomSchema = z.object({
  name: z.string().min(3, "Oda adi en az 3 karakter").max(64, "Oda adi en fazla 64 karakter"),
  description: z.string().max(500).optional(),
  isPrivate: z.boolean().default(false),
});

export const slugParamSchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(64)
    .regex(/^[a-z0-9-]+$/, "Slug sadece kucuk harf, rakam ve tire"),
});

export const listMessagesQuerySchema = z.object({
  before: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const sendMessageSchema = z.object({
  content: z.string().min(1).max(5000).optional(),
});

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
