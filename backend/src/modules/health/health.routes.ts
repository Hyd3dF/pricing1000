import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler";
import { pingDb } from "../../db/client";
import { pingMinio } from "../../storage/minio";

export const healthRouter = Router();

healthRouter.get(
  "/health",
  asyncHandler(async (_req, res) => {
    res.json({ status: "ok", version: "0.2.0" });
  }),
);

healthRouter.get(
  "/health/ready",
  asyncHandler(async (_req, res) => {
    const [db, minio] = await Promise.all([pingDb(), pingMinio()]);
    const ready = db && minio;
    res.status(ready ? 200 : 503).json({
      status: ready ? "ready" : "not_ready",
      checks: { database: db, minio },
    });
  }),
);
