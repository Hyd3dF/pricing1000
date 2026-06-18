import type { Request, Response, NextFunction, RequestHandler } from "express";
import { verifyAccessToken } from "../lib/jwt";
import { unauthorized } from "../lib/errors";

export interface AuthedRequest extends Request {
  userId?: string;
  username?: string;
}

export const requireAuth: RequestHandler = (
  req: AuthedRequest,
  _res: Response,
  next: NextFunction,
) => {
  const header = req.header("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) {
    return next(unauthorized("Kimlik dogrulama gerekli"));
  }
  try {
    const payload = verifyAccessToken(match[1]);
    req.userId = payload.sub;
    req.username = payload.username;
    next();
  } catch {
    next(unauthorized("Gecersiz veya suresi dolmus token"));
  }
};

export const optionalAuth: RequestHandler = (req: AuthedRequest, _res, next) => {
  const header = req.header("authorization");
  if (!header) return next();
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return next(unauthorized("Gecersiz yetkilendirme basligi"));
  try {
    const payload = verifyAccessToken(match[1]);
    req.userId = payload.sub;
    req.username = payload.username;
    next();
  } catch {
    next(unauthorized("Gecersiz veya suresi dolmus token"));
  }
};
