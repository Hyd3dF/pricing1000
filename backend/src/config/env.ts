import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const booleanString = z
  .string()
  .transform((v) => v === "true" || v === "1")
  .default("false");

const csv = z
  .string()
  .transform((s) =>
    s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
  );

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8080),
  WEB_APP_ORIGIN: z
    .string()
    .default("")
    .transform((s) =>
      s
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
    ),

  DATABASE_URL: z.string().min(1, "DATABASE_URL zorunludur"),
  DATABASE_SSL_MODE: z.enum(["disable", "require", "verify-full"]).default("disable"),
  DATABASE_SSL_CA: z.string().optional(),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),

  JWT_PRIVATE_KEY: z.string().optional(),
  JWT_PUBLIC_KEY: z.string().optional(),
  JWT_PRIVATE_KEY_B64: z.string().optional(),
  JWT_PUBLIC_KEY_B64: z.string().optional(),
  JWT_ISSUER: z.string().default("konu-backend"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("7d"),

  SERVICE_API_KEY: z.string().optional(),

  MINIO_ENDPOINT: z.string().default("localhost"),
  MINIO_PORT: z.coerce.number().int().positive().default(9000),
  MINIO_USE_SSL: booleanString,
  MINIO_ACCESS_KEY: z.string().min(1, "MINIO_ACCESS_KEY zorunludur"),
  MINIO_SECRET_KEY: z.string().min(1, "MINIO_SECRET_KEY zorunludur"),
  MINIO_BUCKET: z.string().default("konu-photos"),
  MINIO_PUBLIC_BASE_URL: z.string().default(""),

  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(15_728_640),
  PHOTO_MAX_DIMENSION: z.coerce.number().int().positive().default(1700),
  PHOTO_QUALITY: z.coerce.number().int().min(1).max(100).default(85),
  PHOTO_MAX_PIXELS: z.coerce.number().int().positive().default(40_000_000),
  ALLOWED_PHOTO_MIMES: csv.default("image/jpeg,image/png,image/webp"),
  AVATAR_MAX_DIMENSION: z.coerce.number().int().positive().default(256),

  HTTPS_CERT: z.string().optional(),
  HTTPS_KEY: z.string().optional(),

  RATE_LIMIT_GENERAL_MAX: z.coerce.number().int().positive().default(600),
  RATE_LIMIT_GENERAL_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
  RATE_LIMIT_LOGIN_MAX: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_LOGIN_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_REGISTER_MAX: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_REGISTER_WINDOW_MS: z.coerce.number().int().positive().default(3_600_000),
  RATE_LIMIT_UPLOAD_MAX: z.coerce.number().int().positive().default(40),
  RATE_LIMIT_UPLOAD_WINDOW_MS: z.coerce.number().int().positive().default(3_600_000),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("Ortam degiskenleri gecersiz:\n");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

function decodePem(value: string | undefined, variable: string): string | undefined {
  if (!value) return undefined;
  const decoded = Buffer.from(value.trim(), "base64").toString("utf8").trim();
  if (!decoded.includes("-----BEGIN ") || !decoded.includes(" KEY-----")) {
    console.error(`${variable} gecerli bir Base64 PEM anahtari degildir.`);
    process.exit(1);
  }
  return `${decoded}\n`;
}

const privateKeyFromBase64 = decodePem(
  parsed.data.JWT_PRIVATE_KEY_B64,
  "JWT_PRIVATE_KEY_B64",
);
const publicKeyFromBase64 = decodePem(
  parsed.data.JWT_PUBLIC_KEY_B64,
  "JWT_PUBLIC_KEY_B64",
);

export const env = {
  ...parsed.data,
  JWT_PRIVATE_KEY: privateKeyFromBase64 ?? parsed.data.JWT_PRIVATE_KEY,
  JWT_PUBLIC_KEY: publicKeyFromBase64 ?? parsed.data.JWT_PUBLIC_KEY,
};

export const isProd = env.NODE_ENV === "production";
export const isDev = env.NODE_ENV === "development";

export function assertSecretsForServer(): void {
  const missing: string[] = [];
  if (!env.JWT_PRIVATE_KEY) missing.push("JWT_PRIVATE_KEY veya JWT_PRIVATE_KEY_B64");
  if (!env.JWT_PUBLIC_KEY) missing.push("JWT_PUBLIC_KEY veya JWT_PUBLIC_KEY_B64");
  if (!env.SERVICE_API_KEY) missing.push("SERVICE_API_KEY");
  if (missing.length > 0) {
    console.error(
      `\nEksik gizli anahtar(lar): ${missing.join(", ")}\n` +
        `Once 'npm run setup' calistirin.\n`,
    );
    process.exit(1);
  }
}
