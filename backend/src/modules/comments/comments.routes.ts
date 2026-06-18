import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler";
import { validate } from "../../middleware/validate";
import { requireAuth, type AuthedRequest } from "../../middleware/auth";
import { uploadLimiter } from "../../middleware/rateLimit";
import * as commentsService from "./comments.service";
import { topicIdParamSchema } from "../topics/topics.schema";
import {
  createCommentSchema,
  updateCommentSchema,
  commentIdParamSchema,
  voteSchema,
} from "./comments.schema";

export const commentsRouter = Router();

commentsRouter.get(
  "/topics/:id/comments",
  validate(topicIdParamSchema, "params"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const comments = await commentsService.listComments(req.params.id, req.userId);
    res.json({ comments });
  }),
);

commentsRouter.post(
  "/topics/:id/comments",
  requireAuth,
  uploadLimiter,
  validate(topicIdParamSchema, "params"),
  validate(createCommentSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    const comment = await commentsService.createComment(req.params.id, req.userId!, req.body);
    res.status(201).json({ comment });
  }),
);

commentsRouter.put(
  "/comments/:id",
  requireAuth,
  validate(commentIdParamSchema, "params"),
  validate(updateCommentSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    const comment = await commentsService.updateComment(req.params.id, req.userId!, req.body.body);
    res.json({ comment });
  }),
);

commentsRouter.delete(
  "/comments/:id",
  requireAuth,
  validate(commentIdParamSchema, "params"),
  asyncHandler(async (req: AuthedRequest, res) => {
    await commentsService.deleteComment(req.params.id, req.userId!);
    res.status(204).end();
  }),
);

commentsRouter.post(
  "/comments/:id/vote",
  requireAuth,
  validate(commentIdParamSchema, "params"),
  validate(voteSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    const result = await commentsService.voteComment(req.params.id, req.userId!, req.body.value);
    res.json(result);
  }),
);
