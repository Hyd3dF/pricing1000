import { hash, verify, Algorithm } from "@node-rs/argon2";

const OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(password: string): Promise<string> {
  return hash(normalize(password), OPTIONS);
}

export async function verifyPassword(
  hashed: string,
  password: string,
): Promise<boolean> {
  try {
    return await verify(hashed, normalize(password));
  } catch {
    return false;
  }
}

function normalize(password: string): string {
  return password.normalize("NFKC");
}
