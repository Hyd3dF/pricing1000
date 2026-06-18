import { z } from "zod";

export const voteSchema = z.object({
  value: z.union([z.literal(1), z.literal(-1)]),
});

export const createCommentSchema = z.object({
  body: z.string().min(1, "Yorum bos olamaz").max(10000),
  parentId: z.string().uuid().optional().nullable(),
});

export const updateCommentSchema = z.object({
  body: z.string().min(1).max(10000),
});

export const commentIdParamSchema = z.object({
  id: z.string().uuid("Gecersiz UUID"),
});

export const topicIdInPathSchema = z.object({
  topicId: z.string().uuid("Gecersiz UUID"),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;
