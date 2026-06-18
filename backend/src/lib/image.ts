import sharp from "sharp";
import { env } from "../config/env";

export type AllowedMime = "image/jpeg" | "image/png" | "image/webp";

export interface ProcessedImage {
  buffer: Buffer;
  mimeType: AllowedMime;
  width: number;
  height: number;
  size: number;
}

export interface DetectedImage {
  mimeType: AllowedMime;
}

const SIGNATURES: { mime: AllowedMime; bytes: number[] }[] = [
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
];

export function detectImageType(buffer: Buffer): DetectedImage | null {
  for (const sig of SIGNATURES) {
    if (buffer.length >= sig.bytes.length && sig.bytes.every((b, i) => buffer[i] === b)) {
      return { mimeType: sig.mime };
    }
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return { mimeType: "image/webp" };
  }
  return null;
}

export function isAllowedMime(mime: string): mime is AllowedMime {
  return (env.ALLOWED_PHOTO_MIMES as string[]).includes(mime);
}

export async function processImage(
  buffer: Buffer,
  detected: AllowedMime,
  maxDimension: number = env.PHOTO_MAX_DIMENSION,
  quality: number = env.PHOTO_QUALITY,
): Promise<ProcessedImage> {
  let pipeline = sharp(buffer, {
    failOn: "truncated",
    limitInputPixels: env.PHOTO_MAX_PIXELS,
    sequentialRead: true,
  }).rotate();

  pipeline = pipeline.resize({
    width: maxDimension,
    height: maxDimension,
    fit: "inside",
    withoutEnlargement: true,
  });

  let outMime: AllowedMime = detected;
  if (detected === "image/jpeg") {
    pipeline = pipeline.jpeg({ quality, mozjpeg: true, progressive: true });
  } else if (detected === "image/png") {
    pipeline = pipeline.png({
      compressionLevel: 9,
      quality,
      palette: true,
      effort: 7,
    });
  } else if (detected === "image/webp") {
    pipeline = pipeline.webp({ quality, effort: 4 });
  }

  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  return {
    buffer: data,
    mimeType: outMime,
    width: info.width,
    height: info.height,
    size: info.size,
  };
}

export async function processAvatar(buffer: Buffer): Promise<ProcessedImage> {
  const detected = detectImageType(buffer);
  if (!detected) {
    throw new ImageValidationError("Desteklenmeyen dosya turu (magic bytes)");
  }
  return processImage(buffer, detected.mimeType, env.AVATAR_MAX_DIMENSION, 85);
}

export class ImageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageValidationError";
  }
}
