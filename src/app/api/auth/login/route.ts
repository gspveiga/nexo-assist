import { cookies } from "next/headers";
import { getDatabase, findUserByEmail } from "@/server/db/database.ts";
import { createSessionToken, sessionCookieName, sessionMaxAge } from "@/server/auth/session.ts";
import { assertSameOrigin, errorResponse, readJson } from "@/server/api.ts";
import { assertRateLimit, clientIpFromRequest } from "@/server/rate-limit.ts";
import { ServiceError } from "@/server/services/errors.ts";

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    assertRateLimit("login", clientIpFromRequest(request), 20);
    const body = await readJson<{ email?: unknown; password?: unknown; remember?: unknown }>(request);
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const persistent = body.remember !== false;
    if (!email || !email.includes("@") || email.length > 200 || !password || password.length > 200) {
      throw new ServiceError("Informe um e-mail corporativo e uma senha.", 400, "INVALID_CREDENTIALS");
    }
    const user = await findUserByEmail(await getDatabase(), email);
    if (!user || !email.endsWith("@nexo.com.br")) {
      throw new ServiceError("Esse e-mail não está cadastrado no ambiente de demonstração.", 401, "USER_NOT_FOUND");
    }
    const cookieStore = await cookies();
    cookieStore.set(sessionCookieName, createSessionToken(user), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      ...(persistent ? { maxAge: sessionMaxAge() } : {}),
    });
    return Response.json({ user, redirectTo: user.role === "analyst" ? "/console" : "/chat" });
  } catch (error) {
    return errorResponse(error);
  }
}
