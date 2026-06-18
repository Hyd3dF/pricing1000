import { z } from "zod";
import type { Category } from "../../types";

const CATEGORIES: Category[] = ["general", "dev", "design", "startup", "offtopic"];

export const createTopicSchema = z.object({
  title: z.string().min(5, "Baslik en az 5 karakter").max(200, "Baslik en fazla 200 karakter"),
  body: z.string().min(20, "Icerik en az 20 karakter").max(50000),
  category: z.enum(CATEGORIES as [Category, ...Category[]]).default("general"),
  tags: z.array(z.string().regex(/^[a-z0-9-]+$/).min(1).max(30)).max(5).default([]),
});

export const updateTopicSchema = z.object({
  title: z.string().min(5).max(200).optional(),
  body: z.string().min(20).max(50000).optional(),
  category: z.enum(CATEGORIES as [Category, ...Category[]]).optional(),
  tags: z.array(z.string().regex(/^[a-z0-9-]+$/).min(1).max(30)).max(5).optional(),
});

export const voteSchema = z.object({
  value: z.union([z.literal(1), z.literal(-1)]),
});

export const listTopicsQuerySchema = z.object({
  sort: z.enum(["trending", "new", "top"]).default("trending"),
  category: z.enum(CATEGORIES as [Category, ...Category[]]).optional(),
  tag: z.string().max(30).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const topicIdParamSchema = z.object({
  id: z.string().uuid("Gecersiz UUID"),
});

export type CreateTopicInput = z.infer<typeof createTopicSchema>;
export type UpdateTopicInput = z.infer<typeof updateTopicSchema>;
