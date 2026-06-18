import { z } from "zod";

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  owner: z.enum(["me"]).optional(),
});

export const photoIdParamSchema = z.object({
  id: z.string().uuid("Gecersiz UUID"),
});
