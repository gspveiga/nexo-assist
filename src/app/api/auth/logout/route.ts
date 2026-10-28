import { cookies } from "next/headers";
import { assertSameOrigin, errorResponse } from "@/server/api.ts";
import { sessionCookieName } from "@/server/auth/session.ts";

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const cookieStore = await cookies();
    cookieStore.delete(sessionCookieName);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
