import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod";
import { badRequest } from "../lib/errors";

type Target = "body" | "query" | "params";

export function validate(schema: ZodSchema, target: Target = "body") {
  return (req: Request, _res: Response, next: NextFunction) => {
    const source = req[target];
    const result = schema.safeParse(source);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      }));
      return next(badRequest("Dogrulama hatasi", details));
    }
    Object.assign(req[target], result.data);
    next();
  };
}
