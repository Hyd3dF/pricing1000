import { z } from "zod";

export const followTargetSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-z0-9_]+$/i),
});

export const notificationIdParamSchema = z.object({
  id: z.string().uuid("Gecersiz UUID"),
});
