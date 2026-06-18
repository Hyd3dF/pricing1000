import { query } from "../../db/client";
import type { CommentRow, CommentDTO, UserRow } from "../../types";
import { publicUrl } from "../../storage/minio";
import { notFound, forbidden, badRequest } from "../../lib/errors";
import type { CreateCommentInput } from "./comments.schema";

interface CommentListRow extends CommentRow {
  author_username: string;
  author_display_name: string | null;
  author_avatar_key: string | null;
  my_vote: 1 | -1 | 0 | null;
}

function rowToDTO(row: CommentListRow): CommentDTO {
  return {
    id: row.id,
    topicId: row.topic_id,
    parentId: row.parent_id,
    userId: row.user_id,
    authorUsername: row.author_username,
    authorDisplayName: row.author_display_name,
    authorAvatarUrl: row.author_avatar_key ? publicUrl(row.author_avatar_key) : null,
    body: row.body,
    upvotes: row.upvotes,
    downvotes: row.downvotes,
    score: row.upvotes - row.downvotes,
    depth: row.depth,
    myVote: (row.my_vote ?? 0) as 1 | -1 | 0,
    children: [],
    createdAt: row.created_at,
  };
}

function buildTree(rows: CommentListRow[]): CommentDTO[] {
  const map = new Map<string, CommentDTO>();
  const roots: CommentDTO[] = [];
  const dtos = rows.map(rowToDTO);
  for (const dto of dtos) map.set(dto.id, dto);
  for (const dto of dtos) {
    if (dto.parentId && map.has(dto.parentId)) {
      map.get(dto.parentId)!.children.push(dto);
    } else {
      roots.push(dto);
    }
  }
  return roots;
}

export async function createComment(
  topicId: string,
  userId: string,
  input: CreateCommentInput,
): Promise<CommentDTO> {
  const { rows: topicRows } = await query<{ id: string }>(
    "SELECT id FROM topics WHERE id = $1",
    [topicId],
  );
  if (!topicRows[0]) throw notFound("Konu bulunamadi");

  let depth = 0;
  let parentId: string | null = null;

  if (input.parentId) {
    parentId = input.parentId;
    const { rows: parentRows } = await query<CommentRow>(
      "SELECT id, depth, topic_id FROM comments WHERE id = $1",
      [parentId],
    );
    if (!parentRows[0]) throw notFound("Ust yorum bulunamadi");
    if (parentRows[0].topic_id !== topicId) {
      throw badRequest("Ust yorum bu konuya ait degil");
    }
    depth = parentRows[0].depth + 1;
    if (depth > 3) throw badRequest("Maksimum yorum derinligi (3) asildi");
  }

  const { rows } = await query<CommentRow>(
    `INSERT INTO comments (topic_id, user_id, parent_id, body, depth)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [topicId, userId, parentId, input.body, depth],
  );
  const comment = rows[0];

  const { rows: userRows } = await query<UserRow>(
    "SELECT username, display_name, avatar_key FROM users WHERE id = $1",
    [userId],
  );
  const u = userRows[0];

  return {
    id: comment.id,
    topicId: comment.topic_id,
    parentId: comment.parent_id,
    userId: comment.user_id,
    authorUsername: u.username,
    authorDisplayName: u.display_name,
    authorAvatarUrl: u.avatar_key ? publicUrl(u.avatar_key) : null,
    body: comment.body,
    upvotes: 0,
    downvotes: 0,
    score: 0,
    depth: comment.depth,
    myVote: 0,
    children: [],
    createdAt: comment.created_at,
  };
}

export async function listComments(topicId: string, viewerId?: string): Promise<CommentDTO[]> {
  const { rows } = await query<CommentListRow>(
    `SELECT c.*,
       u.username AS author_username,
       u.display_name AS author_display_name,
       u.avatar_key AS author_avatar_key,
       (SELECT v.value FROM votes v WHERE v.target_type='comment' AND v.target_id=c.id AND v.user_id=$2) AS my_vote
     FROM comments c JOIN users u ON u.id = c.user_id
     WHERE c.topic_id = $1
     ORDER BY c.created_at ASC`,
    [topicId, viewerId ?? null],
  );
  return buildTree(rows);
}

export async function updateComment(
  commentId: string,
  userId: string,
  body: string,
): Promise<CommentDTO> {
  const { rows } = await query<CommentRow>("SELECT user_id, topic_id FROM comments WHERE id = $1", [commentId]);
  if (!rows[0]) throw notFound("Yorum bulunamadi");
  if (rows[0].user_id !== userId) throw forbidden("Bu yorumu duzenleme yetkiniz yok");

  await query("UPDATE comments SET body = $2 WHERE id = $1", [commentId, body]);
  const single = await listComments(rows[0].topic_id, userId);
  const found = findInTree(single, commentId);
  if (!found) throw notFound("Yorum bulunamadi");
  return found;
}

export async function deleteComment(commentId: string, userId: string): Promise<void> {
  const { rows } = await query<CommentRow>("SELECT user_id FROM comments WHERE id = $1", [commentId]);
  if (!rows[0]) throw notFound("Yorum bulunamadi");
  if (rows[0].user_id !== userId) throw forbidden("Bu yorumu silme yetkiniz yok");
  await query("DELETE FROM comments WHERE id = $1", [commentId]);
}

export async function voteComment(
  commentId: string,
  userId: string,
  value: 1 | -1,
): Promise<{ upvotes: number; downvotes: number; myVote: 1 | -1 | 0 }> {
  const { rows } = await query<CommentRow>("SELECT id FROM comments WHERE id = $1", [commentId]);
  if (!rows[0]) throw notFound("Yorum bulunamadi");

  const { rows: existing } = await query<{ value: number }>(
    "SELECT value FROM votes WHERE user_id=$1 AND target_type='comment' AND target_id=$2",
    [userId, commentId],
  );

  if (existing[0]) {
    if (existing[0].value === value) {
      await query("DELETE FROM votes WHERE user_id=$1 AND target_type='comment' AND target_id=$2", [userId, commentId]);
    } else {
      await query("UPDATE votes SET value=$3 WHERE user_id=$1 AND target_type='comment' AND target_id=$2", [userId, commentId, value]);
    }
  } else {
    await query(
      "INSERT INTO votes (user_id, target_type, target_id, value) VALUES ($1,'comment',$2,$3)",
      [userId, commentId, value],
    );
  }

  const { rows: counts } = await query<{ upvotes: number; downvotes: number }>(
    `SELECT COUNT(*) FILTER (WHERE value=1)::int AS upvotes, COUNT(*) FILTER (WHERE value=-1)::int AS downvotes
     FROM votes WHERE target_type='comment' AND target_id=$1`,
    [commentId],
  );
  await query("UPDATE comments SET upvotes=$2, downvotes=$3 WHERE id=$1", [commentId, counts[0].upvotes, counts[0].downvotes]);

  const myVote = existing[0]?.value === value ? 0 : value;
  return { upvotes: counts[0].upvotes, downvotes: counts[0].downvotes, myVote };
}

export async function listCommentsByUser(
  userId: string,
  page = 1,
  limit = 20,
  viewerId?: string,
): Promise<{ id: string; topicId: string; topicTitle: string; body: string; upvotes: number; createdAt: string }[]> {
  const offset = (page - 1) * limit;
  const { rows } = await query<any>(
    `SELECT c.id, c.topic_id, c.body, c.upvotes, c.created_at,
       u.username AS author_username,
       u.display_name AS author_display_name,
       u.avatar_key AS author_avatar_key,
       t.title AS topic_title,
       (SELECT v.value FROM votes v WHERE v.target_type='comment' AND v.target_id=c.id AND v.user_id=$4) AS my_vote
     FROM comments c
     JOIN users u ON u.id = c.user_id
     JOIN topics t ON t.id = c.topic_id
     WHERE c.user_id = $3
     ORDER BY c.created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset, userId, viewerId ?? null],
  );
  return rows.map((row) => ({
    id: row.id,
    topicId: row.topic_id,
    topicTitle: row.topic_title,
    body: row.body,
    upvotes: row.upvotes,
    createdAt: row.created_at,
  }));
}

function findInTree(nodes: CommentDTO[], id: string): CommentDTO | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const found = findInTree(n.children, id);
    if (found) return found;
  }
  return undefined;
}
