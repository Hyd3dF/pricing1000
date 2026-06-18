import cors from "cors";
import { env } from "../config/env";

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    if (!origin || env.WEB_APP_ORIGIN.length === 0) {
      callback(null, true);
      return;
    }
    if (env.WEB_APP_ORIGIN.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"],
  exposedHeaders: ["X-RateLimit-Remaining", "X-RateLimit-Reset"],
  credentials: false,
  maxAge: 600,
});
