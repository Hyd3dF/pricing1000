import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler";
import { validate } from "../../middleware/validate";
import { requireAuth, type AuthedRequest } from "../../middleware/auth";
import * as socialService from "./social.service";
import { followTargetSchema, notificationIdParamSchema } from "./social.schema";

export const socialRouter = Router();

socialRouter.post(
  "/users/:username/follow",
  requireAuth,
  validate(followTargetSchema, "params"),
  asyncHandler(async (req: AuthedRequest, res) => {
    await socialService.follow(req.userId!, req.params.username);
    res.status(204).end();
  }),
);

socialRouter.delete(
  "/users/:username/follow",
  requireAuth,
  validate(followTargetSchema, "params"),
  asyncHandler(async (req: AuthedRequest, res) => {
    await socialService.unfollow(req.userId!, req.params.username);
    res.status(204).end();
  }),
);

socialRouter.get(
  "/notifications",
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const filter = req.query.filter === "unread" ? "unread" : "all";
    const page = parseInt(req.query.page as string, 10) || 1;
    const result = await socialService.listNotifications(req.userId!, filter, page);
    res.json(result);
  }),
);

socialRouter.post(
  "/notifications/read-all",
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    await socialService.markAllRead(req.userId!);
    res.status(204).end();
  }),
);

socialRouter.patch(
  "/notifications/:id/read",
  requireAuth,
  validate(notificationIdParamSchema, "params"),
  asyncHandler(async (req: AuthedRequest, res) => {
    await socialService.markRead(req.params.id, req.userId!);
    res.status(204).end();
  }),
);
