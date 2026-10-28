import { cookies } from "next/headers";
import { sessionCookieName } from "@/server/auth/session.ts";

export async function POST(): Promise<Response> {
  const cookieStore = await cookies();
  cookieStore.delete(sessionCookieName);
  return Response.json({ ok: true });
}
