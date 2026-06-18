import { query } from "../../db/client";
import type { TopicRow, TopicDTO, UserRow } from "../../types";
import { publicUrl } from "../../storage/minio";
import { notFound, forbidden, conflict } from "../../lib/errors";
import type { CreateTopicInput, UpdateTopicInput } from "./topics.schema";
import type { Category } from "../../types";

interface TopicListRow extends TopicRow {
  author_username: string;
  author_display_name: string | null;
  author_avatar_key: string | null;
  my_vote: 1 | -1 | 0 | null;
  is_saved: boolean | null;
}

function rowToDTO(row: TopicListRow): TopicDTO {
  return {
    id: row.id,
    userId: row.user_id,
    authorUsername: row.author_username,
    authorDisplayName: row.author_display_name,
    authorAvatarUrl: row.author_avatar_key ? publicUrl(row.author_avatar_key) : null,
    title: row.title,
    body: row.body,
    category: row.category,
    tags: row.tags,
    upvotes: row.upvotes,
    downvotes: row.downvotes,
    score: row.upvotes - row.downvotes,
    viewCount: row.view_count,
    commentCount: row.comment_count,
    isPinned: row.is_pinned,
    myVote: (row.my_vote ?? 0) as 1 | -1 | 0,
    isSaved: !!row.is_saved,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLS = `
  t.*,
  u.username AS author_username,
  u.display_name AS author_display_name,
  u.avatar_key AS author_avatar_key
`;

export async function createTopic(
  userId: string,
  input: CreateTopicInput,
): Promise<TopicDTO> {
  const { rows } = await query<TopicRow>(
    `INSERT INTO topics (user_id, title, body, category, tags)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [userId, input.title, input.body, input.category, input.tags],
  );
  const topic = rows[0];
  const { rows: userRows } = await query<UserRow>(
    "SELECT username, display_name, avatar_key FROM users WHERE id = $1",
    [userId],
  );
  const u = userRows[0];
  return {
    id: topic.id,
    userId: topic.user_id,
    authorUsername: u.username,
    authorDisplayName: u.display_name,
    authorAvatarUrl: u.avatar_key ? publicUrl(u.avatar_key) : null,
    title: topic.title,
    body: topic.body,
    category: topic.category,
    tags: topic.tags,
    upvotes: topic.upvotes,
    downvotes: topic.downvotes,
    score: 0,
    viewCount: topic.view_count,
    commentCount: topic.comment_count,
    isPinned: topic.is_pinned,
    myVote: 0,
    isSaved: false,
    createdAt: topic.created_at,
    updatedAt: topic.updated_at,
  };
}

export async function getTopic(
  topicId: string,
  viewerId?: string,
  clientIp?: string,
): Promise<TopicDTO> {
  const viewerHash = viewerId || clientIp || "anonymous";
  const { rowCount } = await query(
    "INSERT INTO topic_views (topic_id, viewer_hash) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [topicId, viewerHash]
  );
  if (rowCount && rowCount > 0) {
    await query("UPDATE topics SET view_count = view_count + 1 WHERE id = $1", [topicId]);
  }

  const { rows } = await query<TopicListRow>(
    `SELECT ${SELECT_COLS},
      (SELECT v.value FROM votes v WHERE v.target_type='topic' AND v.target_id=t.id AND v.user_id=$2) AS my_vote,
      (SELECT 1 FROM saves s WHERE s.topic_id=t.id AND s.user_id=$2) AS is_saved
     FROM topics t JOIN users u ON u.id = t.user_id
     WHERE t.id = $1`,
    [topicId, viewerId ?? null],
  );
  if (!rows[0]) throw notFound("Konu bulunamadi");
  return rowToDTO(rows[0]);
}

export async function listTopics(
  params: {
    sort: "trending" | "new" | "top";
    category?: Category;
    tag?: string;
    page: number;
    limit: number;
  },
  viewerId?: string,
): Promise<{ topics: TopicDTO[]; total: number }> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIdx = 1;

  if (params.category) {
    conditions.push(`t.category = $${paramIdx++}`);
    values.push(params.category);
  }
  if (params.tag) {
    conditions.push(`$${paramIdx++} = ANY(t.tags)`);
    values.push(params.tag);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const viewerParam = paramIdx++;
  values.push(viewerId ?? null);

  let orderBy: string;
  if (params.sort === "new") {
    orderBy = "t.created_at DESC";
  } else if (params.sort === "top") {
    orderBy = "(t.upvotes - t.downvotes) DESC, t.created_at DESC";
  } else {
    orderBy = `(
      (t.upvotes - t.downvotes) + (t.comment_count * 1.5) + (t.view_count * 0.1)
    ) * (1.0 / POWER(EXTRACT(EPOCH FROM (NOW() - t.created_at)) / 3600.0 + 2, 1.8)) DESC`;
  }

  const offset = (params.page - 1) * params.limit;
  const limitParam = paramIdx++;
  values.push(params.limit);
  const offsetParam = paramIdx++;
  values.push(offset);

  const { rows } = await query<TopicListRow>(
    `SELECT ${SELECT_COLS},
      (SELECT v.value FROM votes v WHERE v.target_type='topic' AND v.target_id=t.id AND v.user_id=$${viewerParam}) AS my_vote,
      (SELECT 1 FROM saves s WHERE s.topic_id=t.id AND s.user_id=$${viewerParam}) AS is_saved
     FROM topics t JOIN users u ON u.id = t.user_id
     ${where}
     ORDER BY t.is_pinned DESC, ${orderBy}
     LIMIT $${limitParam} OFFSET $${offsetParam}`,
    values,
  );

  const { rows: countRows } = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM topics t ${where}`,
    values.slice(0, conditions.length),
  );

  return {
    topics: rows.map(rowToDTO),
    total: parseInt(countRows[0].count, 10),
  };
}

export async function updateTopic(
  topicId: string,
  userId: string,
  input: UpdateTopicInput,
): Promise<TopicDTO> {
  const { rows: ownerRows } = await query<TopicRow>(
    "SELECT user_id FROM topics WHERE id = $1",
    [topicId],
  );
  if (!ownerRows[0]) throw notFound("Konu bulunamadi");
  if (ownerRows[0].user_id !== userId) throw forbidden("Bu konuyu duzenleme yetkiniz yok");

  const fields: string[] = [];
  const values: unknown[] = [];
  if (input.title !== undefined) { values.push(input.title); fields.push(`title = $${values.length}`); }
  if (input.body !== undefined) { values.push(input.body); fields.push(`body = $${values.length}`); }
  if (input.category !== undefined) { values.push(input.category); fields.push(`category = $${values.length}`); }
  if (input.tags !== undefined) { values.push(input.tags); fields.push(`tags = $${values.length}`); }

  if (fields.length === 0) return getTopic(topicId, userId);

  values.push(topicId);
  const { rows } = await query<TopicListRow>(
    `UPDATE topics SET ${fields.join(", ")} WHERE id = $${values.length}
     RETURNING ${SELECT_COLS}`,
    values,
  );
  return rowToDTO({ ...rows[0], my_vote: null, is_saved: null });
}

export async function deleteTopic(topicId: string, userId: string): Promise<void> {
  const { rows } = await query<TopicRow>("SELECT user_id FROM topics WHERE id = $1", [topicId]);
  if (!rows[0]) throw notFound("Konu bulunamadi");
  if (rows[0].user_id !== userId) throw forbidden("Bu konuyu silme yetkiniz yok");
  await query("DELETE FROM topics WHERE id = $1", [topicId]);
}

export async function voteTopic(
  topicId: string,
  userId: string,
  value: 1 | -1,
): Promise<{ upvotes: number; downvotes: number; myVote: 1 | -1 | 0 }> {
  const { rows: topicRows } = await query<TopicRow>("SELECT id FROM topics WHERE id = $1", [topicId]);
  if (!topicRows[0]) throw notFound("Konu bulunamadi");

  const { rows: existing } = await query<{ value: number }>(
    "SELECT value FROM votes WHERE user_id=$1 AND target_type='topic' AND target_id=$2",
    [userId, topicId],
  );

  if (existing[0]) {
    if (existing[0].value === value) {
      await query("DELETE FROM votes WHERE user_id=$1 AND target_type='topic' AND target_id=$2", [userId, topicId]);
    } else {
      await query("UPDATE votes SET value=$3 WHERE user_id=$1 AND target_type='topic' AND target_id=$2", [userId, topicId, value]);
    }
  } else {
    await query(
      "INSERT INTO votes (user_id, target_type, target_id, value) VALUES ($1,'topic',$2,$3)",
      [userId, topicId, value],
    );
  }

  const { rows: counts } = await query<{ upvotes: number; downvotes: number }>(
    `SELECT COUNT(*) FILTER (WHERE value=1)::int AS upvotes, COUNT(*) FILTER (WHERE value=-1)::int AS downvotes
     FROM votes WHERE target_type='topic' AND target_id=$1`,
    [topicId],
  );
  await query("UPDATE topics SET upvotes=$2, downvotes=$3 WHERE id=$1", [topicId, counts[0].upvotes, counts[0].downvotes]);

  const myVote = existing[0]?.value === value ? 0 : value;
  return { upvotes: counts[0].upvotes, downvotes: counts[0].downvotes, myVote };
}

export async function saveTopic(topicId: string, userId: string): Promise<void> {
  const { rows } = await query<TopicRow>("SELECT id FROM topics WHERE id = $1", [topicId]);
  if (!rows[0]) throw notFound("Konu bulunamadi");
  try {
    await query("INSERT INTO saves (user_id, topic_id) VALUES ($1, $2)", [userId, topicId]);
  } catch {
    throw conflict("Zaten kaydedilmis");
  }
}

export async function unsaveTopic(topicId: string, userId: string): Promise<void> {
  await query("DELETE FROM saves WHERE user_id=$1 AND topic_id=$2", [userId, topicId]);
}

export async function listSavedTopics(userId: string, page = 1, limit = 20): Promise<TopicDTO[]> {
  const offset = (page - 1) * limit;
  const { rows } = await query<TopicListRow>(
    `SELECT ${SELECT_COLS},
      (SELECT v.value FROM votes v WHERE v.target_type='topic' AND v.target_id=t.id AND v.user_id=$3) AS my_vote,
      TRUE AS is_saved
     FROM topics t
     JOIN users u ON u.id = t.user_id
     JOIN saves s ON s.topic_id = t.id AND s.user_id = $3
     ORDER BY s.created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset, userId],
  );
  return rows.map(rowToDTO);
}

export async function listTopicsByUser(userId: string, page = 1, limit = 20, viewerId?: string): Promise<TopicDTO[]> {
  const offset = (page - 1) * limit;
  const { rows } = await query<TopicListRow>(
    `SELECT ${SELECT_COLS},
       (SELECT v.value FROM votes v WHERE v.target_type='topic' AND v.target_id=t.id AND v.user_id=$4) AS my_vote,
       (SELECT 1 FROM saves s WHERE s.topic_id=t.id AND s.user_id=$4) AS is_saved
     FROM topics t JOIN users u ON u.id = t.user_id
     WHERE t.user_id = $3 ORDER BY t.created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset, userId, viewerId ?? null],
  );
  return rows.map(rowToDTO);
}
