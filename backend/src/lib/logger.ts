import { isProd } from "../config/env";

type Level = "debug" | "info" | "warn" | "error";

function ts(): string {
  return new Date().toISOString();
}

function write(level: Level, msg: string, meta?: unknown): void {
  const base = { time: ts(), level, msg };
  const payload = meta !== undefined ? { ...base, meta } : base;
  if (isProd) {
    console[level === "debug" ? "log" : level](JSON.stringify(payload));
  } else {
    const metaStr = meta !== undefined ? ` ${JSON.stringify(meta)}` : "";
    const tag =
      level === "error" ? "\x1b[31m" : level === "warn" ? "\x1b[33m" : level === "info" ? "\x1b[36m" : "\x1b[90m";
    console[level === "debug" ? "log" : level](`${tag}[${level.toUpperCase()}]\x1b[0m ${msg}${metaStr}`);
  }
}

export const logger = {
  debug: (msg: string, meta?: unknown) => write("debug", msg, meta),
  info: (msg: string, meta?: unknown) => write("info", msg, meta),
  warn: (msg: string, meta?: unknown) => write("warn", msg, meta),
  error: (msg: string, meta?: unknown) => write("error", msg, meta),
};
