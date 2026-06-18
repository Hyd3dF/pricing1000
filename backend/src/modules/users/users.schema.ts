import { z } from "zod";

export const updateMeSchema = z
  .object({
    displayName: z.string().min(1).max(64).optional(),
    bio: z.string().max(500).optional(),
    websiteUrl: z.string().url("Gecersiz URL").max(255).optional().or(z.literal("")),
    githubUrl: z.string().url("Gecersiz URL").max(255).optional().or(z.literal("")),
    twitterUrl: z.string().url("Gecersiz URL").max(255).optional().or(z.literal("")),
  })
  .strict();

export const usernameParamSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-z0-9_]+$/i),
});

export type UpdateMeInput = z.infer<typeof updateMeSchema>;
