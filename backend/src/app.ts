import express, { type Express } from "express";
import helmet from "helmet";
import { randomUUID } from "crypto";
import { assertSecretsForServer, env } from "./config/env";
import { corsMiddleware } from "./middleware/cors";
import { generalLimiter } from "./middleware/rateLimit";
import { apiKeyMiddleware } from "./middleware/apiKey";
import { optionalAuth } from "./middleware/auth";
import { asyncHandler } from "./middleware/asyncHandler";
import { notFoundHandler, errorHandler } from "./middleware/error";
import { healthRouter } from "./modules/health/health.routes";
import { authRouter } from "./modules/auth/auth.routes";
import { usersRouter } from "./modules/users/users.routes";
import { photosRouter } from "./modules/photos/photos.routes";
import { topicsRouter } from "./modules/topics/topics.routes";
import { commentsRouter } from "./modules/comments/comments.routes";
import { roomsRouter } from "./modules/rooms/rooms.routes";
import { socialRouter } from "./modules/social/social.routes";
import { searchRouter } from "./modules/search/search.routes";
import { readObject } from "./storage/minio";

export function createApp(): Express {
  assertSecretsForServer();

  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", env.TRUST_PROXY_HOPS || false);
  app.set("query parser", "extended");

  app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
  }));
  app.use((req, res, next) => {
    const requestId = req.header("x-request-id") || randomUUID();
    req.headers["x-request-id"] = requestId;
    res.setHeader("x-request-id", requestId);
    next();
  });
  app.use(express.json({ limit: "1mb", strict: true }));
  app.use(corsMiddleware);

  // MinIO'yu disariya acmadan gorselleri backend uzerinden sun.
  app.get("/uploads/:bucket/*", asyncHandler(async (req, res) => {
    const bucket = req.params.bucket;
    const key = req.params[0];
    if (bucket !== env.MINIO_BUCKET || !key) {
      res.status(404).send("File not found");
      return;
    }
    try {
      const object = await readObject(key, bucket);
      res.setHeader("Content-Type", object.mimeType);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.send(object.buffer);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "NoSuchKey" || code === "NotFound" || code === "ENOENT") {
        res.status(404).send("File not found");
        return;
      }
      throw err;
    }
  }));

  app.get("/", (_req, res) => {
    res.json({ name: "konu-backend", version: "0.2.0", docs: "/api/health" });
  });

  app.use("/api", healthRouter);

  app.use("/api", generalLimiter);
  app.use("/api", apiKeyMiddleware);
  app.use("/api", optionalAuth);

  app.use("/api/auth", authRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/topics", topicsRouter);
  app.use("/api", commentsRouter);
  app.use("/api/rooms", roomsRouter);
  app.use("/api/photos", photosRouter);
  app.use("/api", socialRouter);
  app.use("/api", searchRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
