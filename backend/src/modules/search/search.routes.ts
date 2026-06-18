import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler";
import { query } from "../../db/client";
import { publicUrl } from "../../storage/minio";
import type { AuthedRequest } from "../../middleware/auth";

export const searchRouter = Router();

searchRouter.get(
  "/search",
  asyncHandler(async (req: AuthedRequest, res) => {
    const q = (req.query.q as string || "").trim();
    if (!q) {
      return res.json({ topics: [], users: [], rooms: [] });
    }

    const likeQuery = `%${q}%`;
    const viewerId = req.userId || null;

    // 1. Search Topics
    const topicsQuery = `
      SELECT t.*,
        u.username AS author_username,
        u.display_name AS author_display_name,
        u.avatar_key AS author_avatar_key,
        (SELECT v.value FROM votes v WHERE v.target_type='topic' AND v.target_id=t.id AND v.user_id=$2) AS my_vote,
        (SELECT 1 FROM saves s WHERE s.topic_id=t.id AND s.user_id=$2) AS is_saved
      FROM topics t
      JOIN users u ON u.id = t.user_id
      WHERE lower(t.title) LIKE lower($1) OR lower(t.body) LIKE lower($1) OR $3 = ANY(t.tags)
      ORDER BY t.created_at DESC LIMIT 50
    `;
    const { rows: topicRows } = await query<any>(topicsQuery, [likeQuery, viewerId, q]);

    const topics = topicRows.map((row: any) => ({
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
    }));

    // 2. Search Users
    const usersQuery = `
      SELECT u.*,
        (SELECT COUNT(*)::text FROM topics t WHERE t.user_id = u.id) AS topic_count,
        (SELECT COUNT(*)::text FROM comments c WHERE c.user_id = u.id) AS comment_count,
        (SELECT COUNT(*)::text FROM follows f WHERE f.following_id = u.id) AS followers_count,
        (SELECT COUNT(*)::text FROM follows f WHERE f.follower_id = u.id) AS following_count
      FROM users u
      WHERE lower(u.username) LIKE lower($1) OR lower(u.display_name) LIKE lower($1) OR lower(u.bio) LIKE lower($1)
      ORDER BY u.reputation DESC LIMIT 50
    `;
    const { rows: userRows } = await query<any>(usersQuery, [likeQuery]);

    const users = userRows.map((row: any) => ({
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      bio: row.bio,
      avatarUrl: row.avatar_key ? publicUrl(row.avatar_key) : null,
      websiteUrl: row.website_url,
      githubUrl: row.github_url,
      twitterUrl: row.twitter_url,
      reputation: row.reputation,
      createdAt: row.created_at,
      topicCount: Number(row.topic_count ?? 0),
      commentCount: Number(row.comment_count ?? 0),
      followersCount: Number(row.followers_count ?? 0),
      followingCount: Number(row.following_count ?? 0),
    }));

    // 3. Search Rooms
    const roomsQuery = `
      SELECT r.*,
        u.username AS owner_username,
        (SELECT 1 FROM room_members rm WHERE rm.room_id=r.id AND rm.user_id=$2) AS is_member
      FROM rooms r
      JOIN users u ON u.id = r.owner_id
      WHERE lower(r.name) LIKE lower($1) OR lower(r.description) LIKE lower($1) OR lower(r.slug) LIKE lower($1)
      ORDER BY r.created_at DESC LIMIT 50
    `;
    const { rows: roomRows } = await query<any>(roomsQuery, [likeQuery, viewerId]);

    const rooms = roomRows.map((row: any) => ({
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
    }));

    res.json({ topics, users, rooms });
  }),
);
