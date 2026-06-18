import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler";
import { validate } from "../../middleware/validate";
import { requireAuth, type AuthedRequest } from "../../middleware/auth";
import { uploadLimiter } from "../../middleware/rateLimit";
import * as photosService from "./photos.service";
import { listQuerySchema, photoIdParamSchema } from "./photos.schema";
import { createPhotoUpload, handlePhotoUpload } from "./upload.middleware";

export const photosRouter = Router();

photosRouter.post(
  "/",
  requireAuth,
  uploadLimiter,
  createPhotoUpload(),
  handlePhotoUpload,
  asyncHandler(async (req: AuthedRequest, res) => {
    const meta = res.locals.upload as {
      key: string;
      originalName: string;
      mimeType: string;
      size: number;
      width: number;
      height: number;
    };
    const photo = await photosService.createPhoto(req.userId!, meta);
    res.status(201).json({ photo });
  }),
);

photosRouter.get(
  "/",
  requireAuth,
  validate(listQuerySchema, "query"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const { limit } = req.query as unknown as { limit: number };
    const photos = await photosService.listPhotosByOwner(req.userId!, limit);
    res.json({ photos });
  }),
);

photosRouter.get(
  "/:id",
  validate(photoIdParamSchema, "params"),
  asyncHandler(async (req, res) => {
    const photo = await photosService.getPhoto(req.params.id);
    res.json({ photo });
  }),
);

photosRouter.delete(
  "/:id",
  requireAuth,
  validate(photoIdParamSchema, "params"),
  asyncHandler(async (req: AuthedRequest, res) => {
    await photosService.deletePhoto(req.params.id, req.userId!);
    res.status(204).end();
  }),
);
