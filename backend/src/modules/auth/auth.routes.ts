import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler";
import { validate } from "../../middleware/validate";
import { requireAuth, type AuthedRequest } from "../../middleware/auth";
import { loginLimiter, registerLimiter } from "../../middleware/rateLimit";
import { getClientInfo } from "../../lib/client";
import * as authService from "./auth.service";
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
} from "./auth.schema";

export const authRouter = Router();

authRouter.post(
  "/register",
  registerLimiter,
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const { user, bundle } = await authService.register(req.body, getClientInfo(req));
    res.status(201).json({ user, ...bundle });
  }),
);

authRouter.post(
  "/login",
  loginLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { user, bundle } = await authService.login(req.body, getClientInfo(req));
    res.json({ user, ...bundle });
  }),
);

authRouter.post(
  "/refresh",
  validate(refreshSchema),
  asyncHandler(async (req, res) => {
    const bundle = await authService.refresh(req.body.refreshToken, getClientInfo(req));
    res.json(bundle);
  }),
);

authRouter.post(
  "/logout",
  validate(logoutSchema),
  asyncHandler(async (req, res) => {
    await authService.logout(req.body.refreshToken);
    res.status(204).end();
  }),
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = await authService.getMe(req.userId!);
    res.json({ user });
  }),
);
