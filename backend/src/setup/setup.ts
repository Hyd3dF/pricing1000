import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { env } from "../config/env";
import { generateRsaKeyPair, generateApiKey } from "../lib/crypto";
import { runMigrations } from "../db/migrate";
import { closeDb, pingDb } from "../db/client";
import { ensureBucket, setBucketPublicRead } from "../storage/minio";
import { logger } from "../lib/logger";

const ENV_PATH = path.join(process.cwd(), ".env");

function readEnvFile(): string {
  if (!existsSync(ENV_PATH)) return "";
  return readFileSync(ENV_PATH, "utf8");
}

function upsertEnvKey(content: string, key: string, value: string): string {
  const lines = content.split(/\r?\n/);
  const escaped = value.replace(/\n/g, "\\n");
  let found = false;
  const out = lines.map((line) => {
    const match = new RegExp(`^\\s*${key}\\s*=`).exec(line);
    if (match) {
      found = true;
      return `${key}=${escaped}`;
    }
    return line;
  });
  if (!found) {
    out.push(`${key}=${escaped}`);
  }
  return out.join("\n");
}

function writeToEnv(updates: Record<string, string>): void {
  let content = readEnvFile();
  for (const [key, value] of Object.entries(updates)) {
    content = upsertEnvKey(content, key, value);
  }
  writeFileSync(ENV_PATH, content, "utf8");
  console.log(`\n✓ ${Object.keys(updates).length} anahtar .env dosyasina yazildi: ${ENV_PATH}`);
}

function banner(text: string): void {
  const line = "═".repeat(Math.max(text.length + 4, 60));
  console.log(`\n${line}\n  ${text}\n${line}`);
}

async function setup(): Promise<void> {
  console.log("\n╔════════════════════════════════════════╗");
  console.log("║   Konu Backend — Ilk Kurulum (Setup)   ║");
  console.log("╚════════════════════════════════════════╝\n");

  const updates: Record<string, string> = {};

  // 1) JWT anahtar cifti
  if (!env.JWT_PRIVATE_KEY || !env.JWT_PUBLIC_KEY) {
    console.log("→ RS256 JWT anahtar cifti uretiliyor (4096-bit)...");
    const { privateKey, publicKey } = generateRsaKeyPair();
    updates.JWT_PRIVATE_KEY = privateKey;
    updates.JWT_PUBLIC_KEY = publicKey;
    console.log("  ✓ Anahtar cifti uretildi");
  } else {
    console.log("→ JWT anahtar cifti zaten mevcut, atlandi");
  }

  // 2) Servis API anahtari
  if (!env.SERVICE_API_KEY) {
    console.log("→ Servis API anahtari uretiliyor...");
    const apiKey = generateApiKey();
    updates.SERVICE_API_KEY = apiKey;
    console.log("  ✓ API anahtari uretildi");
  } else {
    console.log("→ Servis API anahtari zaten mevcut, atlandi");
  }

  if (Object.keys(updates).length > 0) {
    writeToEnv(updates);
  } else {
    console.log("\n✓ Tum gizli anahtarlar zaten .env'de mevcut.");
  }

  // 3) Veritabani baglantisi + migration
  banner("Veritabani (PostgreSQL)");
  console.log(`  Baglanti: ${env.DATABASE_URL.replace(/:[^:@]+@/, ":****@")}`);
  const dbOk = await pingDb();
  if (!dbOk) {
    console.error("\n✗ PostgreSQL baglantisi basarisiz. DATABASE_URL kontrol edin.");
    await closeDb();
    process.exit(1);
  }
  console.log("  ✓ PostgreSQL baglantisi OK");
  console.log("→ Migrationlar calistiriliyor...");
  try {
    const res = await runMigrations();
    console.log(`  ✓ ${res.applied.length} yeni, ${res.skipped.length} mevcut migration`);
  } catch (err) {
    console.error("\n✗ Migration hatasi:", err instanceof Error ? err.message : err);
    await closeDb();
    process.exit(1);
  }

  // 4) MinIO bucket
  banner("Dosya Deposu (MinIO)");
  console.log(`  Endpoint: ${env.MINIO_ENDPOINT}:${env.MINIO_PORT}`);
  console.log(`  Bucket:   ${env.MINIO_BUCKET}`);
  try {
    await ensureBucket(env.MINIO_BUCKET);
    await setBucketPublicRead(env.MINIO_BUCKET);
    console.log("  ✓ Bucket hazir, public-read policy uygulandi");
  } catch (err) {
    console.error("\n✗ MinIO hatasi:", err instanceof Error ? err.message : err);
    await closeDb();
    process.exit(1);
  }

  await closeDb();

  // 5) Baglanti bilgilerini yazdir
  const port = env.PORT;
  const host = env.NODE_ENV === "production" ? "<sunucu-adresi>" : `localhost`;
  const baseUrl = `http${env.HTTPS_CERT ? "s" : ""}://${host}:${port}/api`;
  const apiKey = env.SERVICE_API_KEY ?? updates.SERVICE_API_KEY ?? "<.env icinde>";

  banner("KURULUM TAMAM — Web Uygulamasi Baglanti Bilgileri");
  console.log(`  API Base URL : ${baseUrl}`);
  console.log(`  API Key      : ${apiKey}`);
  console.log("");
  console.log("  Bu bilgileri web uygulamanizin ortam degiskenlerine ekleyin:");
  console.log("    BACKEND_API_URL=" + baseUrl);
  console.log("    BACKEND_API_KEY=" + apiKey);
  console.log("");
  console.log("  Web uygulamasi, isteklerde 'X-API-Key' header'i ile bu anahtari gondermeli.");
  console.log("  Gizli anahtar .env dosyasinda saklanir — repoya islemeyin.");
  console.log("");
  console.log("  Sunucuyu baslatmak:  npm run dev   (gelistirme)");
  console.log("                        npm run build && npm start   (uretim)\n");

  logger.info("setup tamamlandi");
}

setup().catch((err) => {
  console.error("\n✗ Beklenmeyen hata:", err);
  process.exit(1);
});
