import multer from "multer";
import { env } from "../../config/env";
import { payloadTooLarge, badRequest } from "../../lib/errors";
import { detectImageType, processImage, processAvatar, ImageValidationError } from "../../lib/image";
import { putObject, publicUrl } from "../../storage/minio";
import { randomUUID } from "crypto";
import type { Request, Response, NextFunction } from "express";
import type { AuthedRequest } from "../../middleware/auth";

const memoryStorage = multer.memoryStorage();

function fileFilter(
  _req: unknown,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) {
  const allowed = env.ALLOWED_PHOTO_MIMES as string[];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new ImageValidationError(`Desteklenmeyen mime: ${file.mimetype}`));
  }
}

export function createPhotoUpload() {
  return multer({
    storage: memoryStorage,
    limits: { fileSize: env.UPLOAD_MAX_BYTES, files: 1 },
    fileFilter,
  }).single("file");
}

export function createAvatarUpload() {
  return multer({
    storage: memoryStorage,
    limits: { fileSize: 5_242_880, files: 1 },
    fileFilter,
  }).single("file");
}

function extForMime(mime: string): string {
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  return "";
}

export async function handlePhotoUpload(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.file) {
      return next(badRequest("Dosya gerekli (field: 'file')"));
    }
    const detected = detectImageType(req.file.buffer);
    if (!detected) {
      return next(badRequest("Gecersiz gorsel — magic bytes eslesmedi (zararli/bozuk dosya)"));
    }
    if (req.file.size > env.UPLOAD_MAX_BYTES) {
      return next(payloadTooLarge("Dosya cok buyuk"));
    }

    const processed = await processImage(req.file.buffer, detected.mimeType);

    const key = `photos/${(req as AuthedRequest).userId}/${randomUUID()}${extForMime(processed.mimeType)}`;
    await putObject(key, processed.buffer, processed.mimeType);

    res.locals.upload = {
      key,
      originalName: req.file.originalname,
      mimeType: processed.mimeType,
      size: processed.size,
      width: processed.width,
      height: processed.height,
    };
    next();
  } catch (err) {
    if (err instanceof ImageValidationError) {
      return next(badRequest(err.message));
    }
    next(err);
  }
}

export async function handleAvatarUpload(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.file) {
      return next(badRequest("Avatar dosyasi gerekli (field: 'file')"));
    }
    const detected = detectImageType(req.file.buffer);
    if (!detected) {
      return next(badRequest("Gecersiz gorsel — magic bytes eslesmedi"));
    }

    const processed = await processAvatar(req.file.buffer);
    const key = `avatars/${(req as AuthedRequest).userId}/${randomUUID()}${extForMime(processed.mimeType)}`;
    await putObject(key, processed.buffer, processed.mimeType);

    res.locals.avatar = { avatarKey: key, avatarUrl: publicUrl(key) };
    next();
  } catch (err) {
    if (err instanceof ImageValidationError) {
      return next(badRequest(err.message));
    }
    next(err);
  }
}
