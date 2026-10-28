import { requireUser } from "@/server/auth/current-user.ts";
import { errorResponse, readJson } from "@/server/api.ts";
import { getDatabase } from "@/server/db/database.ts";
import { processUserMessage } from "@/server/services/chat.ts";

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireUser("employee");
    const body = await readJson<{ conversationId?: unknown; message?: unknown }>(request);
    if (typeof body.conversationId !== "string" || typeof body.message !== "string") {
      return Response.json({ error: "Informe a conversa e a mensagem.", code: "INVALID_INPUT" }, { status: 400 });
    }
    return Response.json(await processUserMessage(getDatabase(), user, body.conversationId, body.message));
  } catch (error) {
    return errorResponse(error);
  }
}
