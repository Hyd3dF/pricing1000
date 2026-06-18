import jwt from "jsonwebtoken";
import { env } from "../config/env";

export interface AccessTokenPayload {
  sub: string;
  username: string;
  type: "access";
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshId: string;
}

export function signAccessToken(payload: {
  sub: string;
  username: string;
}): string {
  if (!env.JWT_PRIVATE_KEY) {
    throw new Error("JWT_PRIVATE_KEY yok — once 'npm run setup' calistirin");
  }
  return jwt.sign(
    { sub: payload.sub, username: payload.username, type: "access" },
    env.JWT_PRIVATE_KEY.replace(/\\n/g, "\n"),
    {
      algorithm: "RS256",
      issuer: env.JWT_ISSUER,
      expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions["expiresIn"],
    },
  );
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  if (!env.JWT_PUBLIC_KEY) {
    throw new Error("JWT_PUBLIC_KEY yok");
  }
  const decoded = jwt.verify(token, env.JWT_PUBLIC_KEY.replace(/\\n/g, "\n"), {
    algorithms: ["RS256"],
    issuer: env.JWT_ISSUER,
  }) as AccessTokenPayload;
  if (decoded.type !== "access") {
    throw new Error("Gecersiz token tipi");
  }
  return decoded;
}

export function parseRefreshTtlMs(): number {
  return parseDurationToMs(env.JWT_REFRESH_TTL);
}

export function parseAccessTtlMs(): number {
  return parseDurationToMs(env.JWT_ACCESS_TTL);
}

function parseDurationToMs(input: string): number {
  const match = /^(\d+)([smhd])$/.exec(input.trim());
  if (!match) return 0;
  const n = Number(match[1]);
  const unit = match[2];
  const mult: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return n * (mult[unit] ?? 0);
}
