import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler";
import { validate } from "../../middleware/validate";
import { requireAuth, type AuthedRequest } from "../../middleware/auth";
import { uploadLimiter } from "../../middleware/rateLimit";
import * as topicsService from "./topics.service";
import {
  createTopicSchema,
  updateTopicSchema,
  voteSchema,
  listTopicsQuerySchema,
  topicIdParamSchema,
} from "./topics.schema";

export const topicsRouter = Router();

topicsRouter.get(
  "/",
  validate(listTopicsQuerySchema, "query"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const q = req.query as unknown as {
      sort: "trending" | "new" | "top";
      category?: string;
      tag?: string;
      page: number;
      limit: number;
    };
    const result = await topicsService.listTopics(
      { sort: q.sort, category: q.category as never, tag: q.tag, page: q.page, limit: q.limit },
      req.userId,
    );
    res.json(result);
  }),
);

topicsRouter.post(
  "/",
  requireAuth,
  uploadLimiter,
  validate(createTopicSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    const topic = await topicsService.createTopic(req.userId!, req.body);
    res.status(201).json({ topic });
  }),
);

topicsRouter.get(
  "/saved",
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const page = parseInt(req.query.page as string || "1", 10);
    const limit = parseInt(req.query.limit as string || "20", 10);
    const topics = await topicsService.listSavedTopics(req.userId!, page, limit);
    res.json({ topics });
  }),
);

topicsRouter.get(
  "/:id",
  validate(topicIdParamSchema, "params"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const topic = await topicsService.getTopic(req.params.id, req.userId, req.ip);
    res.json({ topic });
  }),
);

topicsRouter.put(
  "/:id",
  requireAuth,
  validate(topicIdParamSchema, "params"),
  validate(updateTopicSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    const topic = await topicsService.updateTopic(req.params.id, req.userId!, req.body);
    res.json({ topic });
  }),
);

topicsRouter.delete(
  "/:id",
  requireAuth,
  validate(topicIdParamSchema, "params"),
  asyncHandler(async (req: AuthedRequest, res) => {
    await topicsService.deleteTopic(req.params.id, req.userId!);
    res.status(204).end();
  }),
);

topicsRouter.post(
  "/:id/vote",
  requireAuth,
  validate(topicIdParamSchema, "params"),
  validate(voteSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    const result = await topicsService.voteTopic(req.params.id, req.userId!, req.body.value);
    res.json(result);
  }),
);

topicsRouter.post(
  "/:id/save",
  requireAuth,
  validate(topicIdParamSchema, "params"),
  asyncHandler(async (req: AuthedRequest, res) => {
    await topicsService.saveTopic(req.params.id, req.userId!);
    res.status(204).end();
  }),
);

topicsRouter.delete(
  "/:id/save",
  requireAuth,
  validate(topicIdParamSchema, "params"),
  asyncHandler(async (req: AuthedRequest, res) => {
    await topicsService.unsaveTopic(req.params.id, req.userId!);
    res.status(204).end();
  }),
);
