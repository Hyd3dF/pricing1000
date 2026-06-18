import { query } from "../../db/client";
import type { UserRow, PrivateUser } from "../../types";
import { toPrivateUser, toPublicUser } from "../../lib/mappers";
import { notFound } from "../../lib/errors";
import type { UpdateMeInput } from "./users.schema";
import type { PublicUser } from "../../types";

async function getById(userId: string): Promise<UserRow> {
  const { rows } = await query<UserRow>("SELECT * FROM users WHERE id = $1", [userId]);
  if (!rows[0]) throw notFound("Kullanici bulunamadi");
  return rows[0];
}

export async function updateMe(
  userId: string,
  input: UpdateMeInput,
): Promise<PrivateUser> {
  const fields: string[] = [];
  const values: unknown[] = [];
  const map: Record<string, string> = {
    displayName: "display_name",
    bio: "bio",
    websiteUrl: "website_url",
    githubUrl: "github_url",
    twitterUrl: "twitter_url",
  };

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    fields.push(`${map[key]} = $${values.length + 1}`);
    values.push(value === "" ? null : value);
  }

  if (fields.length === 0) {
    return toPrivateUser(await getById(userId));
  }

  values.push(userId);
  const { rows } = await query<UserRow>(
    `UPDATE users SET ${fields.join(", ")} WHERE id = $${values.length} RETURNING *`,
    values,
  );
  return toPrivateUser(rows[0]);
}

export async function getProfile(username: string, viewerId?: string): Promise<PublicUser> {
  const { rows } = await query<any>(
    `SELECT u.*,
       (SELECT COUNT(*)::text FROM topics t WHERE t.user_id = u.id) AS topic_count,
       (SELECT COUNT(*)::text FROM comments c WHERE c.user_id = u.id) AS comment_count,
       (SELECT COUNT(*)::text FROM follows f WHERE f.following_id = u.id) AS followers_count,
       (SELECT COUNT(*)::text FROM follows f WHERE f.follower_id = u.id) AS following_count,
       (SELECT 1 FROM follows f WHERE f.follower_id = $2 AND f.following_id = u.id) IS NOT NULL AS is_following
     FROM users u WHERE lower(u.username) = lower($1) LIMIT 1`,
    [username, viewerId ?? null],
  );
  if (!rows[0]) throw notFound("Kullanici bulunamadi");
  return toPublicUser(rows[0]);
}

export async function setAvatarKey(userId: string, avatarKey: string): Promise<PrivateUser> {
  const { rows } = await query<UserRow>(
    "UPDATE users SET avatar_key = $1 WHERE id = $2 RETURNING *",
    [avatarKey, userId],
  );
  return toPrivateUser(rows[0]);
}

export async function getCurrent(userId: string): Promise<PrivateUser> {
  const { rows } = await query<any>(
    `SELECT u.*,
       (SELECT COUNT(*)::text FROM topics t WHERE t.user_id = u.id) AS topic_count,
       (SELECT COUNT(*)::text FROM comments c WHERE c.user_id = u.id) AS comment_count,
       (SELECT COUNT(*)::text FROM follows f WHERE f.following_id = u.id) AS followers_count,
       (SELECT COUNT(*)::text FROM follows f WHERE f.follower_id = u.id) AS following_count
     FROM users u WHERE u.id = $1`,
    [userId],
  );
  if (!rows[0]) throw notFound("Kullanici bulunamadi");
  return toPrivateUser(rows[0]);
}
