import type { Request } from "express";

export type DeviceType = "mobile" | "desktop" | "tablet" | "bot" | "unknown";

export interface ClientInfo {
  ip: string;
  userAgent: string;
  deviceType: DeviceType;
}

export function getRealIp(req: Request): string {
  const headers = req.headers;
  const xff = headers["x-forwarded-for"];
  if (typeof xff === "string") {
    const first = xff.split(",")[0]?.trim();
    if (first && isValidIp(first)) return first;
  }
  const realIp = headers["x-real-ip"];
  if (typeof realIp === "string" && isValidIp(realIp.trim())) {
    return realIp.trim();
  }
  const cfIp = headers["cf-connecting-ip"];
  if (typeof cfIp === "string" && isValidIp(cfIp.trim())) {
    return cfIp.trim();
  }
  return req.ip ?? req.socket?.remoteAddress ?? "0.0.0.0";
}

export function getUserAgent(req: Request): string {
  const ua = req.headers["user-agent"];
  if (typeof ua === "string") return ua.slice(0, 500);
  return "";
}

export function detectDevice(userAgent: string): DeviceType {
  const ua = userAgent.toLowerCase();
  if (!ua) return "unknown";
  if (/bot|crawl|spider|slurp|facebookexternalhit/i.test(ua)) return "bot";
  if (/ipad|tablet|playbook|silk/i.test(ua)) return "tablet";
  if (/mobile|iphone|ipod|android.*mobile|windows phone|blackberry|opera mini/i.test(ua)) {
    return "mobile";
  }
  if (/android/i.test(ua)) return "tablet";
  if (/windows|macintosh|linux|cros|x11/i.test(ua)) return "desktop";
  return "unknown";
}

export function getClientInfo(req: Request): ClientInfo {
  const userAgent = getUserAgent(req);
  return {
    ip: getRealIp(req),
    userAgent,
    deviceType: detectDevice(userAgent),
  };
}

function isValidIp(ip: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) || /^[0-9a-f:]+$/i.test(ip);
}
