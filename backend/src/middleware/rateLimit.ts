import rateLimit from "express-rate-limit";
import { env } from "../config/env";
import { tooManyRequests } from "../lib/errors";
import type { AuthedRequest } from "./auth";

const standardHandler = (
  _req: unknown,
  _res: unknown,
  next: (e: unknown) => void,
) => next(tooManyRequests("Cok fazla istek, lutfen sonra tekrar deneyin"));

export const generalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_GENERAL_WINDOW_MS,
  max: env.RATE_LIMIT_GENERAL_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: standardHandler as never,
});

export const loginLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_LOGIN_WINDOW_MS,
  max: env.RATE_LIMIT_LOGIN_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: standardHandler as never,
});

export const registerLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_REGISTER_WINDOW_MS,
  max: env.RATE_LIMIT_REGISTER_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: standardHandler as never,
});

export const uploadLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_UPLOAD_WINDOW_MS,
  max: env.RATE_LIMIT_UPLOAD_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const ar = req as AuthedRequest;
    return ar.userId ? `u:${ar.userId}` : req.ip ?? "anon";
  },
  handler: standardHandler as never,
});

