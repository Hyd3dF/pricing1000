import { publicUrl } from "../storage/minio";
import type {
  UserRow,
  PublicUser,
  PrivateUser,
  PhotoRow,
  PhotoDTO,
} from "../types";

export function toPublicUser(row: any): PublicUser {
  return {
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
    topicCount: row.topic_count !== undefined ? Number(row.topic_count) : undefined,
    commentCount: row.comment_count !== undefined ? Number(row.comment_count) : undefined,
    followersCount: row.followers_count !== undefined ? Number(row.followers_count) : undefined,
    followingCount: row.following_count !== undefined ? Number(row.following_count) : undefined,
    isFollowing: row.is_following !== undefined ? !!row.is_following : undefined,
  };
}

export function toPrivateUser(row: UserRow): PrivateUser {
  return {
    ...toPublicUser(row),
    email: row.email,
    updatedAt: row.updated_at,
  };
}

export function toPhotoDTO(row: PhotoRow): PhotoDTO {
  return {
    id: row.id,
    ownerId: row.owner_id,
    fileKey: row.file_key,
    url: publicUrl(row.file_key),
    originalName: row.original_name,
    mimeType: row.mime_type,
    size: Number(row.size),
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
  };
}
