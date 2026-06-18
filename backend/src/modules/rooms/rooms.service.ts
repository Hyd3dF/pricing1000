import { query } from "../../db/client";
import type { RoomRow, RoomDTO, RoomMessageRow, RoomMessageDTO, UserRow } from "../../types";
import { publicUrl, removeObject } from "../../storage/minio";
import { notFound, forbidden, conflict } from "../../lib/errors";
import type { CreateRoomInput } from "./rooms.schema";

interface RoomListRow extends RoomRow {
  owner_username: string;
  is_member: boolean | null;
}

function rowToDTO(row: RoomListRow): RoomDTO {
  return {
    id: row.id,
    ownerId: row.owner_id,
    ownerUsername: row.owner_username,
    name: row.name,
    description: row.description,
    slug: row.slug,
    isPrivate: row.is_private,
    memberCount: row.member_count,
    isMember: !!row.is_member,
    createdAt: row.created_at,
  };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
    .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9 ]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 64);
}

async function ensureUniqueSlug(base: string): Promise<string> {
  let slug = base || "oda";
  let i = 1;
  while (true) {
    const { rows } = await query<{ id: string }>("SELECT id FROM rooms WHERE lower(slug) = lower($1)", [slug]);
    if (rows.length === 0) return slug;
    slug = `${base}-${++i}`;
  }
}

export async function createRoom(userId: string, input: CreateRoomInput): Promise<RoomDTO> {
  const slug = await ensureUniqueSlug(slugify(input.name));
  const { rows } = await query<RoomListRow>(
    `INSERT INTO rooms (owner_id, name, description, slug, is_private)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *, (SELECT username FROM users WHERE id = owner_id) AS owner_username, NULL AS is_member`,
    [userId, input.name, input.description ?? null, slug, input.isPrivate],
  );
  const room = rows[0];
  await query("INSERT INTO room_members (room_id, user_id, role) VALUES ($1, $2, 'owner')", [room.id, userId]);
  return rowToDTO({ ...room, is_member: true });
}

export async function getRoom(slug: string, viewerId?: string): Promise<RoomDTO> {
  const { rows } = await query<RoomListRow>(
    `SELECT r.*, u.username AS owner_username,
       (SELECT 1 FROM room_members rm WHERE rm.room_id = r.id AND rm.user_id = $2) AS is_member
     FROM rooms r JOIN users u ON u.id = r.owner_id
     WHERE lower(r.slug) = lower($1)`,
    [slug, viewerId ?? null],
  );
  if (!rows[0]) throw notFound("Oda bulunamadi");
  return rowToDTO(rows[0]);
}

export async function listRooms(viewerId?: string): Promise<RoomDTO[]> {
  const { rows } = await query<RoomListRow>(
    `SELECT r.*, u.username AS owner_username,
       (SELECT 1 FROM room_members rm WHERE rm.room_id = r.id AND rm.user_id = $1) AS is_member
     FROM rooms r JOIN users u ON u.id = r.owner_id
     ORDER BY r.member_count DESC, r.created_at DESC`,
    [viewerId ?? null],
  );
  return rows.map(rowToDTO);
}

export async function joinRoom(slug: string, userId: string): Promise<void> {
  const room = await getRoom(slug, userId);
  if (room.isPrivate) {
    throw forbidden("Bu oda gizlidir, dogrudan katilamazsiniz");
  }
  try {
    await query("INSERT INTO room_members (room_id, user_id, role) VALUES ($1, $2, 'member')", [room.id, userId]);
  } catch {
    throw conflict("Zaten uyesiniz");
  }
}

export async function leaveRoom(slug: string, userId: string): Promise<void> {
  const room = await getRoom(slug, userId);
  const { rows } = await query<{ role: string }>(
    "SELECT role FROM room_members WHERE room_id = $1 AND user_id = $2",
    [room.id, userId],
  );
  if (!rows[0]) throw notFound("Bu odada uye degilsiniz");
  if (rows[0].role === "owner") throw forbidden("Oda sahibi ayrilamaz; odayi silin");
  await query("DELETE FROM room_members WHERE room_id = $1 AND user_id = $2", [room.id, userId]);
}

export async function listMembers(slug: string) {
  const room = await getRoom(slug);
  const { rows } = await query<UserRow & { role: string; joined_at: string }>(
    `SELECT u.*, rm.role, rm.joined_at
     FROM room_members rm JOIN users u ON u.id = rm.user_id
     WHERE rm.room_id = $1 ORDER BY rm.role, rm.joined_at`,
    [room.id],
  );
  return rows.map((r) => ({
    userId: r.id,
    username: r.username,
    displayName: r.display_name,
    avatarUrl: r.avatar_key ? publicUrl(r.avatar_key) : null,
    role: r.role,
    joinedAt: r.joined_at,
  }));
}

async function ensureMember(roomId: string, userId: string): Promise<void> {
  const { rows } = await query<{ role: string }>(
    "SELECT role FROM room_members WHERE room_id = $1 AND user_id = $2",
    [roomId, userId],
  );
  if (!rows[0]) throw forbidden("Bu odaya uye degilsiniz");
}

export async function listMessages(
  slug: string,
  viewerId: string,
  params: { before?: string; limit: number },
): Promise<RoomMessageDTO[]> {
  const room = await getRoom(slug, viewerId);
  await ensureMember(room.id, viewerId);

  const conditions = ["m.room_id = $1"];
  const values: unknown[] = [room.id];
  if (params.before) {
    values.push(params.before);
    conditions.push(`m.created_at < (SELECT created_at FROM room_messages WHERE id = $${values.length})`);
  }
  values.push(params.limit);

  const { rows } = await query<RoomMessageRow & {
    author_username: string;
    author_display_name: string | null;
    author_avatar_key: string | null;
  }>(
    `SELECT m.*, u.username AS author_username, u.display_name AS author_display_name, u.avatar_key AS author_avatar_key
     FROM room_messages m JOIN users u ON u.id = m.user_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY m.created_at DESC LIMIT $${values.length}`,
    values,
  );

  return rows.map((r) => ({
    id: r.id,
    roomId: r.room_id,
    userId: r.user_id,
    authorUsername: r.author_username,
    authorDisplayName: r.author_display_name,
    authorAvatarUrl: r.author_avatar_key ? publicUrl(r.author_avatar_key) : null,
    type: r.type,
    content: r.content,
    fileUrl: r.file_key ? publicUrl(r.file_key) : null,
    fileName: r.file_name,
    fileSize: r.file_size,
    createdAt: r.created_at,
  })).reverse();
}

export async function sendTextMessage(
  slug: string,
  userId: string,
  content: string,
): Promise<RoomMessageDTO> {
  const room = await getRoom(slug, userId);
  await ensureMember(room.id, userId);

  const { rows } = await query<RoomMessageRow & {
    author_username: string;
    author_display_name: string | null;
    author_avatar_key: string | null;
  }>(
    `INSERT INTO room_messages (room_id, user_id, type, content)
     VALUES ($1, $2, 'text', $3)
     RETURNING *,
       (SELECT username FROM users WHERE id = $2) AS author_username,
       (SELECT display_name FROM users WHERE id = $2) AS author_display_name,
       (SELECT avatar_key FROM users WHERE id = $2) AS author_avatar_key`,
    [room.id, userId, content],
  );
  const r = rows[0];
  return {
    id: r.id,
    roomId: r.room_id,
    userId: r.user_id,
    authorUsername: r.author_username,
    authorDisplayName: r.author_display_name,
    authorAvatarUrl: r.author_avatar_key ? publicUrl(r.author_avatar_key) : null,
    type: "text",
    content: r.content,
    fileUrl: null,
    fileName: null,
    fileSize: null,
    createdAt: r.created_at,
  };
}

export async function sendImageMessage(
  slug: string,
  userId: string,
  fileMeta: { key: string; mimeType: string; size: number; fileName: string },
): Promise<RoomMessageDTO> {
  const room = await getRoom(slug, userId);
  await ensureMember(room.id, userId);

  const { rows } = await query<RoomMessageRow & {
    author_username: string;
    author_display_name: string | null;
    author_avatar_key: string | null;
  }>(
    `INSERT INTO room_messages (room_id, user_id, type, file_key, file_name, file_size)
     VALUES ($1, $2, 'image', $3, $4, $5)
     RETURNING *,
       (SELECT username FROM users WHERE id = $2) AS author_username,
       (SELECT display_name FROM users WHERE id = $2) AS author_display_name,
       (SELECT avatar_key FROM users WHERE id = $2) AS author_avatar_key`,
    [room.id, userId, fileMeta.key, fileMeta.fileName, fileMeta.size],
  );
  const r = rows[0];
  return {
    id: r.id,
    roomId: r.room_id,
    userId: r.user_id,
    authorUsername: r.author_username,
    authorDisplayName: r.author_display_name,
    authorAvatarUrl: r.author_avatar_key ? publicUrl(r.author_avatar_key) : null,
    type: "image",
    content: null,
    fileUrl: publicUrl(r.file_key!),
    fileName: r.file_name,
    fileSize: r.file_size,
    createdAt: r.created_at,
  };
}

export async function deleteMessage(
  slug: string,
  messageId: string,
  userId: string,
): Promise<void> {
  const room = await getRoom(slug, userId);
  const { rows } = await query<RoomMessageRow & { role: string }>(
    `SELECT m.*, rm.role FROM room_messages m
     JOIN room_members rm ON rm.room_id = m.room_id AND rm.user_id = $2
     WHERE m.id = $1 AND m.room_id = $3`,
    [messageId, userId, room.id],
  );
  if (!rows[0]) throw notFound("Mesaj bulunamadi");
  if (rows[0].user_id !== userId && rows[0].role !== "admin" && rows[0].role !== "owner") {
    throw forbidden("Bu mesaji silme yetkiniz yok");
  }
  if (rows[0].file_key) {
    await removeObject(rows[0].file_key);
  }
  await query("DELETE FROM room_messages WHERE id = $1", [messageId]);
}
