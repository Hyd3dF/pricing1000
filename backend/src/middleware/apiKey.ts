import type { RequestHandler } from "express";
import { env } from "../config/env";
import { unauthorized } from "../lib/errors";
import { timingSafeEqualString } from "../lib/crypto";

const HEADER = "x-api-key";

export const apiKeyMiddleware: RequestHandler = (req, _res, next) => {
  const provided = req.header(HEADER);
  if (!provided || !env.SERVICE_API_KEY) {
    return next(unauthorized("Eksik veya gecersiz API anahtari"));
  }
  if (!timingSafeEqualString(provided, env.SERVICE_API_KEY)) {
    return next(unauthorized("Eksik veya gecersiz API anahtari"));
  }
  next();
};
