import { Client } from "minio";
import { env } from "../config/env";
import { logger } from "../lib/logger";
import fs from "fs";
import path from "path";

interface BucketPolicyDocument {
  Version: string;
  Statement: Array<{
    Effect: string;
    Principal: { AWS: string[] };
    Action: string[];
    Resource: string[];
  }>;
}

export const minioClient = new Client({
  endPoint: env.MINIO_ENDPOINT,
  port: env.MINIO_PORT,
  useSSL: env.MINIO_USE_SSL,
  accessKey: env.MINIO_ACCESS_KEY,
  secretKey: env.MINIO_SECRET_KEY,
});

export let useLocalDisk = false;
let checkPromise: Promise<boolean> | null = null;

export function initStorageCheck(): Promise<boolean> {
  if (checkPromise) return checkPromise;
  checkPromise = (async () => {
    try {
      await minioClient.listBuckets();
      useLocalDisk = false;
      logger.info("MinIO baglantisi basarili.");
      return false;
    } catch (err) {
      useLocalDisk = true;
      logger.warn("MinIO baglantisi basarisiz, yerel disk fallback (uploads/) etkinlesiyor.", {
        message: (err as Error).message,
      });
      return true;
    }
  })();
  return checkPromise;
}

// Module load ile asenkron baslat
initStorageCheck().catch(() => {});

export interface UploadedObject {
  key: string;
  size: number;
  mimeType: string;
}

export async function ensureBucket(bucket: string): Promise<void> {
  await initStorageCheck();
  if (useLocalDisk) {
    const dir = path.join(process.cwd(), "uploads", bucket);
    fs.mkdirSync(dir, { recursive: true });
    return;
  }
  const exists = await minioClient.bucketExists(bucket);
  if (!exists) {
    await minioClient.makeBucket(bucket, "us-east-1");
    logger.info(`minio bucket olusturuldu: ${bucket}`);
  }
}

export async function setBucketPublicRead(bucket: string): Promise<void> {
  await initStorageCheck();
  if (useLocalDisk) return;
  const policy: BucketPolicyDocument = {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { AWS: ["*"] },
        Action: ["s3:GetObject"],
        Resource: [`arn:aws:s3:::${bucket}/*`],
      },
    ],
  };
  await minioClient.setBucketPolicy(bucket, JSON.stringify(policy));
  logger.info(`minio bucket public-read policy: ${bucket}`);
}

export async function putObject(
  key: string,
  buffer: Buffer,
  mimeType: string,
  bucket: string = env.MINIO_BUCKET,
): Promise<UploadedObject> {
  await initStorageCheck();
  if (useLocalDisk) {
    const filePath = path.join(process.cwd(), "uploads", bucket, key);
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, buffer);
    logger.info(`Dosya yerel diske kaydedildi: ${filePath}`);
    return { key, size: buffer.length, mimeType };
  }

  await minioClient.putObject(bucket, key, buffer, buffer.length, {
    "Content-Type": mimeType,
    "Cache-Control": "public, max-age=31536000, immutable",
  });
  return { key, size: buffer.length, mimeType };
}

export async function removeObject(
  key: string,
  bucket: string = env.MINIO_BUCKET,
): Promise<void> {
  await initStorageCheck();
  if (useLocalDisk) {
    try {
      const filePath = path.join(process.cwd(), "uploads", bucket, key);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logger.info(`Dosya yerel diskten silindi: ${filePath}`);
      }
    } catch (err) {
      logger.warn("Yerel diskten dosya silme hatasi", { key, message: (err as Error).message });
    }
    return;
  }

  try {
    await minioClient.removeObject(bucket, key);
  } catch (err) {
    logger.warn("minio removeObject hatasi", { key, message: (err as Error).message });
  }
}

export function publicUrl(key: string, bucket: string = env.MINIO_BUCKET): string {
  if (useLocalDisk) {
    return `http://localhost:${env.PORT}/uploads/${bucket}/${key}`;
  }

  if (env.MINIO_PUBLIC_BASE_URL) {
    const base = env.MINIO_PUBLIC_BASE_URL.replace(/\/$/, "");
    return `${base}/${bucket}/${encodeURI(key)}`;
  }
  const proto = env.MINIO_USE_SSL ? "https" : "http";
  return `${proto}://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}/${bucket}/${encodeURI(key)}`;
}

export async function pingMinio(): Promise<boolean> {
  try {
    await minioClient.listBuckets();
    return true;
  } catch {
    return false;
  }
}

