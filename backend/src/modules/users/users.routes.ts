import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler";
import { validate } from "../../middleware/validate";
import { requireAuth, type AuthedRequest } from "../../middleware/auth";
import * as usersService from "./users.service";
import * as topicsService from "../topics/topics.service";
import * as commentsService from "../comments/comments.service";
import { updateMeSchema, usernameParamSchema } from "./users.schema";
import { uploadLimiter } from "../../middleware/rateLimit";
import { createAvatarUpload, handleAvatarUpload } from "../photos/upload.middleware";

export const usersRouter = Router();

usersRouter.get(
  "/:username/topics",
  validate(usernameParamSchema, "params"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = await usersService.getProfile(req.params.username);
    const page = parseInt(req.query.page as string || "1", 10);
    const limit = parseInt(req.query.limit as string || "20", 10);
    const topics = await topicsService.listTopicsByUser(user.id, page, limit, req.userId);
    res.json({ topics });
  }),
);

usersRouter.get(
  "/:username/comments",
  validate(usernameParamSchema, "params"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = await usersService.getProfile(req.params.username);
    const page = parseInt(req.query.page as string || "1", 10);
    const limit = parseInt(req.query.limit as string || "20", 10);
    const comments = await commentsService.listCommentsByUser(user.id, page, limit, req.userId);
    res.json({ comments });
  }),
);

usersRouter.get(
  "/:username",
  validate(usernameParamSchema, "params"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = await usersService.getProfile(req.params.username, req.userId);
    res.json({ user });
  }),
);

usersRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = await usersService.getCurrent(req.userId!);
    res.json({ user });
  }),
);

usersRouter.put(
  "/me",
  requireAuth,
  validate(updateMeSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = await usersService.updateMe(req.userId!, req.body);
    res.json({ user });
  }),
);

usersRouter.post(
  "/me/avatar",
  requireAuth,
  uploadLimiter,
  createAvatarUpload(),
  handleAvatarUpload,
  asyncHandler(async (req: AuthedRequest, res) => {
    const { avatarKey, avatarUrl } = res.locals.avatar as {
      avatarKey: string;
      avatarUrl: string;
    };
    const user = await usersService.setAvatarKey(req.userId!, avatarKey);
    res.json({ user, avatarUrl });
  }),
);
