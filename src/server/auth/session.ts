import { createHmac, timingSafeEqual } from "node:crypto";
import type { User, UserRole } from "@/shared/types";

export const sessionCookieName = "nexo_session";
const sessionTtlSeconds = 60 * 60 * 12;
const demoSecret = "nexo-assist-local-demo-secret-change-before-deploy";

export interface SessionPayload {
  userId: string;
  role: UserRole;
  expiresAt: number;
}

function secret(): string {
  const configured = process.env.SESSION_SECRET?.trim();
  if (
    process.env.NODE_ENV === "production"
    && (!configured || configured.length < 32 || configured === "change-me-to-a-long-random-secret" || configured === demoSecret)
  ) {
    throw new Error("Configure SESSION_SECRET com pelo menos 32 caracteres aleatórios em produção.");
  }
  return configured || demoSecret;
}

function signature(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function createSessionToken(user: User, now = Date.now()): string {
  const payload: SessionPayload = {
    userId: user.id,
    role: user.role,
    expiresAt: Math.floor(now / 1000) + sessionTtlSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded)}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now()): SessionPayload | null {
  if (!token) return null;
  const [encoded, providedSignature, extra] = token.split(".");
  if (!encoded || !providedSignature || extra) return null;
  const expected = Buffer.from(signature(encoded));
  const actual = Buffer.from(providedSignature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
    if (!payload.userId || !["employee", "analyst"].includes(payload.role) || payload.expiresAt <= Math.floor(now / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function sessionMaxAge(): number {
  return sessionTtlSeconds;
}
