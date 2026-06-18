import { query } from "../../db/client";
import type { NotificationRow, NotificationDTO, UserRow } from "../../types";
import { notFound, conflict } from "../../lib/errors";
import { publicUrl } from "../../storage/minio";

export async function follow(followerId: string, targetUsername: string): Promise<void> {
  const { rows: targetRows } = await query<UserRow>(
    "SELECT id FROM users WHERE lower(username) = lower($1)",
    [targetUsername],
  );
  if (!targetRows[0]) throw notFound("Kullanici bulunamadi");
  const targetId = targetRows[0].id;
  if (targetId === followerId) throw conflict("Kendinizi takip edemezsiniz");

  try {
    await query("INSERT INTO follows (follower_id, following_id) VALUES ($1, $2)", [followerId, targetId]);
    
    const { rows: followerRows } = await query<{ username: string }>(
      "SELECT username FROM users WHERE id = $1",
      [followerId],
    );
    const followerUsername = followerRows[0]?.username || "user";

    await query(
      `INSERT INTO notifications (user_id, type, title, actor_id, link)
       VALUES ($1, 'follow', $2, $3, $4)`,
      [targetId, "Yeni takipçi", followerId, `/u/${followerUsername}`],
    );
  } catch {
    throw conflict("Zaten takip ediyorsunuz");
  }
}

export async function unfollow(followerId: string, targetUsername: string): Promise<void> {
  const { rows: targetRows } = await query<UserRow>(
    "SELECT id FROM users WHERE lower(username) = lower($1)",
    [targetUsername],
  );
  if (!targetRows[0]) throw notFound("Kullanici bulunamadi");
  await query("DELETE FROM follows WHERE follower_id = $1 AND following_id = $2", [
    followerId,
    targetRows[0].id,
  ]);
}

export async function getFollowCounts(userId: string): Promise<{ followers: number; following: number }> {
  const { rows } = await query<{ followers: string; following: string }>(
    `SELECT
      (SELECT COUNT(*) FROM follows WHERE following_id = $1)::text AS followers,
      (SELECT COUNT(*) FROM follows WHERE follower_id = $1)::text AS following`,
    [userId],
  );
  return { followers: parseInt(rows[0].followers, 10), following: parseInt(rows[0].following, 10) };
}

export async function listNotifications(
  userId: string,
  filter: "all" | "unread" = "all",
  page = 1,
  limit = 20,
): Promise<{ notifications: NotificationDTO[]; total: number; unread: number }> {
  const offset = (page - 1) * limit;
  const where = filter === "unread" ? "AND n.is_read = FALSE" : "";

  const { rows } = await query<NotificationRow & { actor_username: string | null; actor_avatar_key: string | null }>(
    `SELECT n.*, u.username AS actor_username, u.avatar_key AS actor_avatar_key
     FROM notifications n LEFT JOIN users u ON u.id = n.actor_id
     WHERE n.user_id = $1 ${where}
     ORDER BY n.created_at DESC LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  );

  const { rows: countRows } = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM notifications n WHERE n.user_id = $1 ${where}`,
    [userId],
  );
  const { rows: unreadRows } = await query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM notifications WHERE user_id = $1 AND is_read = FALSE",
    [userId],
  );

  return {
    notifications: rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      body: r.body,
      link: r.link,
      isRead: r.is_read,
      actorId: r.actor_id,
      actorUsername: r.actor_username,
      actorAvatarUrl: r.actor_avatar_key ? publicUrl(r.actor_avatar_key) : null,
      createdAt: r.created_at,
    })),
    total: parseInt(countRows[0].count, 10),
    unread: parseInt(unreadRows[0].count, 10),
  };
}

export async function markAllRead(userId: string): Promise<void> {
  await query("UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE", [userId]);
}

export async function markRead(notificationId: string, userId: string): Promise<void> {
  await query("UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2", [
    notificationId,
    userId,
  ]);
}
