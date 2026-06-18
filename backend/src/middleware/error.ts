import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { HttpError } from "../lib/errors";
import { logger } from "../lib/logger";
import type { MulterError } from "multer";

interface ErrorPayload {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId?: string;
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: "Endpoint bulunamadi" },
  } satisfies ErrorPayload);
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = req.headers["x-request-id"]?.toString();

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Dogrulama hatasi",
        details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      requestId,
    } satisfies ErrorPayload);
    return;
  }

  if (err instanceof HttpError) {
    if (err.status >= 500) {
      logger.error("HTTP error", { status: err.status, code: err.code, message: err.message, requestId });
    }
    res.status(err.status).json({
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
      requestId,
    } satisfies ErrorPayload);
    return;
  }

  const multerErr = err as MulterError & { code?: string; status?: number };
  if (multerErr?.name === "MulterError" || multerErr?.code === "LIMIT_FILE_SIZE") {
    const message = multerErr.code === "LIMIT_FILE_SIZE" ? "Dosya cok buyuk" : "Yukleme hatasi";
    res.status(413).json({ error: { code: "PAYLOAD_TOO_LARGE", message }, requestId } satisfies ErrorPayload);
    return;
  }

  const message = err instanceof Error ? err.message : "Bilinmeyen hata";
  logger.error("Unhandled error", {
    message,
    stack: err instanceof Error ? err.stack : undefined,
    requestId,
    path: req.path,
  });

  res.status(500).json({
    error: {
      code: "INTERNAL",
      message: "Sunucu hatasi",
    },
    requestId,
  } satisfies ErrorPayload);
}
