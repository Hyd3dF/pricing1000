import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler";
import { validate } from "../../middleware/validate";
import { requireAuth, type AuthedRequest } from "../../middleware/auth";
import { uploadLimiter } from "../../middleware/rateLimit";
import * as roomsService from "./rooms.service";
import {
  createRoomSchema,
  slugParamSchema,
  listMessagesQuerySchema,
} from "./rooms.schema";
import { createPhotoUpload } from "../photos/upload.middleware";
import { detectImageType, processImage } from "../../lib/image";
import { putObject } from "../../storage/minio";
import { badRequest } from "../../lib/errors";
import { randomUUID } from "crypto";

export const roomsRouter = Router();

roomsRouter.get(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const rooms = await roomsService.listRooms(req.userId);
    res.json({ rooms });
  }),
);

roomsRouter.post(
  "/",
  requireAuth,
  uploadLimiter,
  validate(createRoomSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    const room = await roomsService.createRoom(req.userId!, req.body);
    res.status(201).json({ room });
  }),
);

roomsRouter.get(
  "/:slug",
  validate(slugParamSchema, "params"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const room = await roomsService.getRoom(req.params.slug, req.userId);
    res.json({ room });
  }),
);

roomsRouter.post(
  "/:slug/join",
  requireAuth,
  validate(slugParamSchema, "params"),
  asyncHandler(async (req: AuthedRequest, res) => {
    await roomsService.joinRoom(req.params.slug, req.userId!);
    res.status(204).end();
  }),
);

roomsRouter.delete(
  "/:slug/leave",
  requireAuth,
  validate(slugParamSchema, "params"),
  asyncHandler(async (req: AuthedRequest, res) => {
    await roomsService.leaveRoom(req.params.slug, req.userId!);
    res.status(204).end();
  }),
);

roomsRouter.get(
  "/:slug/members",
  validate(slugParamSchema, "params"),
  asyncHandler(async (req, res) => {
    const members = await roomsService.listMembers(req.params.slug);
    res.json({ members });
  }),
);

roomsRouter.get(
  "/:slug/messages",
  requireAuth,
  validate(slugParamSchema, "params"),
  validate(listMessagesQuerySchema, "query"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const q = req.query as unknown as { before?: string; limit: number };
    const messages = await roomsService.listMessages(req.params.slug, req.userId!, q);
    res.json({ messages });
  }),
);

roomsRouter.post(
  "/:slug/messages",
  requireAuth,
  uploadLimiter,
  validate(slugParamSchema, "params"),
  createPhotoUpload(),
  asyncHandler(async (req: AuthedRequest, res) => {
    if (req.file) {
      const detected = detectImageType(req.file.buffer);
      if (!detected) {
        throw badRequest("Gecersiz gorsel — magic bytes eslesmedi");
      }
      const processed = await processImage(req.file.buffer, detected.mimeType);
      const key = `rooms/${req.userId}/${randomUUID()}`;
      await putObject(key, processed.buffer, processed.mimeType);
      const message = await roomsService.sendImageMessage(req.params.slug, req.userId!, {
        key,
        mimeType: processed.mimeType,
        size: processed.size,
        fileName: req.file.originalname,
      });
      res.status(201).json({ message });
    } else {
      const content = typeof req.body.content === "string" ? req.body.content : "";
      if (!content.trim()) throw badRequest("Mesaj icerigi bos");
      const message = await roomsService.sendTextMessage(req.params.slug, req.userId!, content);
      res.status(201).json({ message });
    }
  }),
);

roomsRouter.delete(
  "/:slug/messages/:id",
  requireAuth,
  validate(slugParamSchema, "params"),
  asyncHandler(async (req: AuthedRequest, res) => {
    await roomsService.deleteMessage(req.params.slug, req.params.id, req.userId!);
    res.status(204).end();
  }),
);
