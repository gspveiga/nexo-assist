import { cookies } from "next/headers";
import { sessionCookieName, verifySessionToken } from "./session.ts";
import { findUserById, getDatabase } from "../db/database.ts";
import { ServiceError } from "../services/errors.ts";
import type { User } from "@/shared/types";

export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  const session = verifySessionToken(token);
  if (!session) return null;
  const user = findUserById(getDatabase(), session.userId);
  if (!user || user.role !== session.role) return null;
  return user;
}

export async function requireUser(role?: User["role"]): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new ServiceError("Faça login para continuar.", 401, "AUTH_REQUIRED");
  if (role && user.role !== role) throw new ServiceError("Você não tem permissão para acessar esta área.", 403, "FORBIDDEN");
  return user;
}
