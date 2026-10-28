import { requireUser } from "@/server/auth/current-user.ts";
import { assertSameOrigin, errorResponse, readJson } from "@/server/api.ts";
import { getDatabase } from "@/server/db/database.ts";
import { assertRateLimit } from "@/server/rate-limit.ts";
import { processUserMessage } from "@/server/services/chat.ts";

export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const user = await requireUser("employee");
    assertRateLimit("chat", user.id, 30);
    const body = await readJson<{ conversationId?: unknown; message?: unknown }>(request);
    if (typeof body.conversationId !== "string" || typeof body.message !== "string") {
      return Response.json({ error: "Informe a conversa e a mensagem.", code: "INVALID_INPUT" }, { status: 400 });
    }
    return Response.json(await processUserMessage(await getDatabase(), user, body.conversationId, body.message));
  } catch (error) {
    return errorResponse(error);
  }
}
