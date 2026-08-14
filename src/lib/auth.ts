import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users, type User } from "@/db/schema";

export const SESSION_COOKIE = "avalialab_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 dias

const SECRET =
  process.env.SESSION_SECRET || "avalialab-dev-secret-troque-em-producao";

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("base64url");
}

/** Gera um token de sessão assinado (HMAC) no formato userId.timestamp.assinatura */
export function createSessionToken(userId: number): string {
  const payload = `${userId}.${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

/** Verifica a assinatura do token e retorna o userId ou null. */
export function verifySessionToken(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const payload = `${parts[0]}.${parts[1]}`;
  const expected = Buffer.from(sign(payload));
  const received = Buffer.from(parts[2]);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return null;
  }
  const userId = Number(parts[0]);
  return Number.isFinite(userId) && userId > 0 ? userId : null;
}

/** Carrega o usuário logado a partir do cookie de sessão (ou null). */
export async function getSessionUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const userId = verifySessionToken(token);
  if (!userId) return null;
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return user ?? null;
}

export type Role = "admin" | "teacher";

/** Exige usuário logado em páginas; redireciona para /login se não houver sessão. */
export async function requireUser(allowed?: Role[]): Promise<User> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (allowed && !allowed.includes(user.role as Role)) redirect("/");
  return user;
}
