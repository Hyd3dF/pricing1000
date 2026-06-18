export interface UserRow {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  bio: string | null;
  avatar_key: string | null;
  website_url: string | null;
  github_url: string | null;
  twitter_url: string | null;
  reputation: number;
  registration_ip: string | null;
  user_agent: string | null;
  device_type: string | null;
  created_at: string;
  updated_at: string;
}

export interface PublicUser {
  id: string;
  username: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  websiteUrl: string | null;
  githubUrl: string | null;
  twitterUrl: string | null;
  reputation: number;
  createdAt: string;
  topicCount?: number;
  commentCount?: number;
  followersCount?: number;
  followingCount?: number;
  isFollowing?: boolean;
}

export interface PrivateUser extends PublicUser {
  email: string;
  updatedAt: string;
}

export interface RefreshTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  revoked: boolean;
  replaced_by: string | null;
}

export interface PhotoRow {
  id: string;
  owner_id: string;
  file_key: string;
  original_name: string | null;
  mime_type: string;
  size: number;
  width: number | null;
  height: number | null;
  created_at: string;
}

export interface PhotoDTO {
  id: string;
  ownerId: string;
  fileKey: string;
  url: string;
  originalName: string | null;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  createdAt: string;
}

export type Category = "general" | "dev" | "design" | "startup" | "offtopic";

export interface TopicRow {
  id: string;
  user_id: string;
  title: string;
  body: string;
  category: Category;
  tags: string[];
  upvotes: number;
  downvotes: number;
  view_count: number;
  comment_count: number;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface TopicDTO {
  id: string;
  userId: string;
  authorUsername: string;
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
  title: string;
  body: string;
  category: Category;
  tags: string[];
  upvotes: number;
  downvotes: number;
  score: number;
  viewCount: number;
  commentCount: number;
  isPinned: boolean;
  myVote: 1 | -1 | 0;
  isSaved: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CommentRow {
  id: string;
  topic_id: string;
  user_id: string;
  parent_id: string | null;
  body: string;
  upvotes: number;
  downvotes: number;
  depth: number;
  created_at: string;
  updated_at: string;
}

export interface CommentDTO {
  id: string;
  topicId: string;
  parentId: string | null;
  userId: string;
  authorUsername: string;
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
  body: string;
  upvotes: number;
  downvotes: number;
  score: number;
  depth: number;
  myVote: 1 | -1 | 0;
  children: CommentDTO[];
  createdAt: string;
}

export interface RoomRow {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  slug: string;
  is_private: boolean;
  member_count: number;
  created_at: string;
}

export interface RoomDTO {
  id: string;
  ownerId: string;
  ownerUsername: string;
  name: string;
  description: string | null;
  slug: string;
  isPrivate: boolean;
  memberCount: number;
  isMember: boolean;
  createdAt: string;
}

export interface RoomMessageRow {
  id: string;
  room_id: string;
  user_id: string;
  type: "text" | "image" | "file";
  content: string | null;
  file_key: string | null;
  file_name: string | null;
  file_size: number | null;
  created_at: string;
}

export interface RoomMessageDTO {
  id: string;
  roomId: string;
  userId: string;
  authorUsername: string;
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
  type: "text" | "image" | "file";
  content: string | null;
  fileUrl: string | null;
  fileName: string | null;
  fileSize: number | null;
  createdAt: string;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  actor_id: string | null;
  created_at: string;
}

export interface NotificationDTO {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  isRead: boolean;
  actorId: string | null;
  actorUsername: string | null;
  actorAvatarUrl?: string | null;
  createdAt: string;
}
