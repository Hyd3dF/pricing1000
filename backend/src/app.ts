import express, { type Express } from "express";
import helmet from "helmet";
import { randomUUID } from "crypto";
import { assertSecretsForServer, env } from "./config/env";
import { corsMiddleware } from "./middleware/cors";
import { generalLimiter } from "./middleware/rateLimit";
import { apiKeyMiddleware } from "./middleware/apiKey";
import { optionalAuth } from "./middleware/auth";
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
import fs from "fs";
import path from "path";
import { detectImageType } from "./lib/image";

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

  // Serve uploads locally in development/fallback mode
  app.get("/uploads/:bucket/*", (req, res) => {
    const bucket = req.params.bucket;
    const key = (req.params as any)[0];
    const filePath = path.join(process.cwd(), "uploads", bucket, key);
    if (!fs.existsSync(filePath)) {
      return res.status(404).send("File not found");
    }
    try {
      const buffer = fs.readFileSync(filePath);
      const detected = detectImageType(buffer);
      if (detected) {
        res.setHeader("Content-Type", detected.mimeType);
      } else {
        const ext = path.extname(filePath).toLowerCase();
        if (ext === ".jpg" || ext === ".jpeg") res.setHeader("Content-Type", "image/jpeg");
        else if (ext === ".png") res.setHeader("Content-Type", "image/png");
        else if (ext === ".webp") res.setHeader("Content-Type", "image/webp");
        else res.setHeader("Content-Type", "application/octet-stream");
      }
      res.send(buffer);
    } catch (err) {
      res.status(500).send("Error reading file");
    }
  });

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
