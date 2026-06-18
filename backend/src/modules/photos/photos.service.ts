import { query } from "../../db/client";
import type { PhotoRow, PhotoDTO } from "../../types";
import { toPhotoDTO } from "../../lib/mappers";
import { notFound, forbidden } from "../../lib/errors";
import { removeObject } from "../../storage/minio";
import { logger } from "../../lib/logger";

interface UploadMeta {
  key: string;
  originalName: string;
  mimeType: string;
  size: number;
  width: number;
  height: number;
}

export async function createPhoto(ownerId: string, meta: UploadMeta): Promise<PhotoDTO> {
  const { rows } = await query<PhotoRow>(
    `INSERT INTO photos (owner_id, file_key, original_name, mime_type, size, width, height)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [ownerId, meta.key, meta.originalName, meta.mimeType, meta.size, meta.width, meta.height],
  );
  return toPhotoDTO(rows[0]);
}

export async function getPhoto(photoId: string): Promise<PhotoDTO> {
  const { rows } = await query<PhotoRow>("SELECT * FROM photos WHERE id = $1", [photoId]);
  if (!rows[0]) throw notFound("Foto bulunamadi");
  return toPhotoDTO(rows[0]);
}

export async function listPhotosByOwner(ownerId: string, limit = 50): Promise<PhotoDTO[]> {
  const { rows } = await query<PhotoRow>(
    "SELECT * FROM photos WHERE owner_id = $1 ORDER BY created_at DESC LIMIT $2",
    [ownerId, limit],
  );
  return rows.map(toPhotoDTO);
}

export async function deletePhoto(photoId: string, ownerId: string): Promise<void> {
  const { rows } = await query<PhotoRow>("SELECT * FROM photos WHERE id = $1", [photoId]);
  const photo = rows[0];
  if (!photo) throw notFound("Foto bulunamadi");
  if (photo.owner_id !== ownerId) throw forbidden("Bu foto silme yetkiniz yok");

  await removeObject(photo.file_key);
  await query("DELETE FROM photos WHERE id = $1", [photoId]);
  logger.info("foto silindi", { photoId, ownerId });
}
