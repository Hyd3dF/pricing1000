import http from "http";
import https from "https";
import { readFileSync } from "fs";
import { createApp } from "./app";
import { env, isProd } from "./config/env";
import { logger } from "./lib/logger";
import { closeDb } from "./db/client";

const app = createApp();

const protocol = env.HTTPS_CERT && env.HTTPS_KEY ? "https" : "http";
const server =
  protocol === "https"
    ? https.createServer(
        {
          cert: readFileSync(env.HTTPS_CERT!),
          key: readFileSync(env.HTTPS_KEY!),
        },
        app,
      )
    : http.createServer(app);

server.listen(env.PORT, () => {
  logger.info(`konu-backend dinliyor: ${protocol}://0.0.0.0:${env.PORT}`, {
    env: env.NODE_ENV,
    port: env.PORT,
    corsOrigins: env.WEB_APP_ORIGIN,
  });
  if (!isProd && env.WEB_APP_ORIGIN.length === 0) {
    logger.warn("WEB_APP_ORIGIN bos — CORS tum originlere acik. Uretimde kisitleyin.");
  }
});

async function shutdown(signal: string): Promise<void> {
  logger.info(`kapatma sinyali: ${signal}`);
  server.close(() => {
    logger.info("HTTP sunucu kapatildi");
  });
  await closeDb();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  logger.error("unhandledRejection", { reason });
});
process.on("uncaughtException", (err) => {
  logger.error("uncaughtException", { message: err.message, stack: err.stack });
  process.exit(1);
});
