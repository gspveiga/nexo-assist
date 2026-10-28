import { requireUser } from "@/server/auth/current-user.ts";
import { assertSameOrigin, errorResponse, readJson } from "@/server/api.ts";
import { getDatabase } from "@/server/db/database.ts";
import { assertRateLimit } from "@/server/rate-limit.ts";
import { sendAnalystMessage } from "@/server/services/console.ts";

export async function POST(request: Request, context: { params: Promise<{ conversationId: string }> }): Promise<Response> {
  try {
    assertSameOrigin(request);
    const analyst = await requireUser("analyst");
    assertRateLimit("console", analyst.id, 40);
    const { conversationId } = await context.params;
    const body = await readJson<{ message?: unknown }>(request);
    if (typeof body.message !== "string") return Response.json({ error: "Informe uma mensagem.", code: "INVALID_INPUT" }, { status: 400 });
    const message = await sendAnalystMessage(await getDatabase(), analyst, conversationId, body.message);
    return Response.json({ message });
  } catch (error) {
    return errorResponse(error);
  }
}
