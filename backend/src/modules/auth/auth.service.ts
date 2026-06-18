import { query, withTransaction } from "../../db/client";
import type { UserRow, RefreshTokenRow } from "../../types";
import { hashPassword, verifyPassword } from "../../lib/password";
import { signAccessToken } from "../../lib/jwt";
import { generateRefreshToken, hashToken } from "../../lib/crypto";
import { parseRefreshTtlMs } from "../../lib/jwt";
import { conflict, unauthorized, notFound } from "../../lib/errors";
import type { RegisterInput, LoginInput } from "./auth.schema";
import type { PrivateUser, PublicUser } from "../../types";
import { toPrivateUser, toPublicUser } from "../../lib/mappers";
import { logger } from "../../lib/logger";
import type { ClientInfo } from "../../lib/client";

interface TokenBundle {
  accessToken: string;
  refreshToken: string;
}

async function findUserByUsername(username: string): Promise<UserRow | null> {
  const { rows } = await query<UserRow>(
    "SELECT * FROM users WHERE lower(username) = lower($1) LIMIT 1",
    [username],
  );
  return rows[0] ?? null;
}

async function findUserByEmail(email: string): Promise<UserRow | null> {
  const { rows } = await query<UserRow>(
    "SELECT * FROM users WHERE lower(email) = lower($1) LIMIT 1",
    [email],
  );
  return rows[0] ?? null;
}

async function issueTokens(
  user: UserRow,
  client: { userAgent: string; ip: string },
): Promise<{ bundle: TokenBundle; refreshId: string }> {
  const accessToken = signAccessToken({ sub: user.id, username: user.username });
  const refreshToken = generateRefreshToken();
  const tokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + parseRefreshTtlMs()).toISOString();

  const { rows } = await query<{ id: string }>(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [user.id, tokenHash, expiresAt, client.userAgent || null, client.ip || null],
  );

  return { bundle: { accessToken, refreshToken }, refreshId: rows[0].id };
}

export async function register(
  input: RegisterInput,
  client: ClientInfo,
): Promise<{ user: PrivateUser; bundle: TokenBundle }> {
  const [existingName, existingEmail] = await Promise.all([
    findUserByUsername(input.username),
    findUserByEmail(input.email),
  ]);
  if (existingName) {
    throw conflict("Bu kullanici adi kullaniliyor");
  }
  if (existingEmail) {
    throw conflict("Bu e-posta zaten kayitli", { field: "email" });
  }

  const passwordHash = await hashPassword(input.password);

  const { rows } = await query<UserRow>(
    `INSERT INTO users (username, email, password_hash, display_name, registration_ip, user_agent, device_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      input.username,
      input.email,
      passwordHash,
      input.displayName ?? input.username,
      client.ip,
      client.userAgent || null,
      client.deviceType,
    ],
  );
  const user = rows[0];
  const { bundle } = await issueTokens(user, client);
  logger.info("yeni kullanici kaydi", { userId: user.id, username: user.username });
  return { user: toPrivateUser(user), bundle };
}

export async function login(
  input: LoginInput,
  client: ClientInfo,
): Promise<{ user: PrivateUser; bundle: TokenBundle }> {
  const user = await findUserByEmail(input.email);
  const passwordOk = user ? await verifyPassword(user.password_hash, input.password) : false;

  if (!user || !passwordOk) {
    throw unauthorized("E-posta veya sifre hatali");
  }

  const { bundle } = await issueTokens(user, client);
  logger.info("kullanici giris yapti", { userId: user.id, device: client.deviceType });
  return { user: toPrivateUser(user), bundle };
}

export async function refresh(
  refreshToken: string,
  info: ClientInfo,
): Promise<TokenBundle> {
  const tokenHash = hashToken(refreshToken);
  const { rows } = await query<RefreshTokenRow>(
    "SELECT * FROM refresh_tokens WHERE token_hash = $1 LIMIT 1",
    [tokenHash],
  );
  const row = rows[0];

  if (!row) {
    throw unauthorized("Gecersiz refresh token");
  }
  if (row.revoked) {
    logger.warn("revoked refresh token ile refresh denemesi", { userId: row.user_id });
    throw unauthorized("Refresh token iptal edilmis");
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await query("UPDATE refresh_tokens SET revoked = TRUE WHERE id = $1", [row.id]);
    throw unauthorized("Refresh token suresi dolmus");
  }

  const { rows: userRows } = await query<UserRow>(
    "SELECT * FROM users WHERE id = $1",
    [row.user_id],
  );
  const user = userRows[0];
  if (!user) {
    throw unauthorized("Kullanici bulunamadi");
  }

  const newBundle = await withTransaction(async (tx) => {
    await tx.query("UPDATE refresh_tokens SET revoked = TRUE WHERE id = $1", [row.id]);
    const accessToken = signAccessToken({ sub: user.id, username: user.username });
    const newRefresh = generateRefreshToken();
    const newHash = hashToken(newRefresh);
    const expiresAt = new Date(Date.now() + parseRefreshTtlMs()).toISOString();
    const { rows: insRows } = await tx.query<{ id: string }>(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip, replaced_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [user.id, newHash, expiresAt, info.userAgent || null, info.ip || null, row.id],
    );
    await tx.query("UPDATE refresh_tokens SET replaced_by = $1 WHERE id = $2", [
      insRows[0].id,
      row.id,
    ]);
    return { accessToken, refreshToken: newRefresh };
  });

  return newBundle;
}

export async function logout(refreshToken: string): Promise<void> {
  const tokenHash = hashToken(refreshToken);
  await query("UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = $1", [tokenHash]);
}

export async function getMe(userId: string): Promise<PrivateUser> {
  const { rows } = await query<UserRow>("SELECT * FROM users WHERE id = $1", [userId]);
  const user = rows[0];
  if (!user) throw notFound("Kullanici bulunamadi");
  return toPrivateUser(user);
}

export async function getPublicProfile(username: string): Promise<PublicUser> {
  const user = await findUserByUsername(username);
  if (!user) throw notFound("Kullanici bulunamadi");
  return toPublicUser(user);
}
