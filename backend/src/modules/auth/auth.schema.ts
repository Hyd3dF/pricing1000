import { z } from "zod";

export const registerSchema = z.object({
  username: z
    .string()
    .min(3, "Kullanici adi en az 3 karakter")
    .max(32, "Kullanici adi en fazla 32 karakter")
    .regex(/^[a-z0-9_]+$/i, "Sadece harf, rakam ve alt cizgi")
    .transform((v) => v.toLowerCase()),
  email: z.string().email("Gecersiz e-posta").max(255).toLowerCase(),
  password: z
    .string()
    .min(8, "Sifre en az 8 karakter")
    .max(128, "Sifre en fazla 128 karakter"),
  displayName: z.string().min(1).max(64).optional(),
});

export const loginSchema = z.object({
  email: z.string().email("Gecersiz e-posta").max(255).toLowerCase(),
  password: z.string().min(1, "Sifre gerekli").max(128),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, "refreshToken gerekli"),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(1, "refreshToken gerekli"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
