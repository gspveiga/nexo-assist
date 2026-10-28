import { requireUser } from "@/server/auth/current-user.ts";
import { errorResponse, readJson } from "@/server/api.ts";
import { getDatabase } from "@/server/db/database.ts";
import { sendAnalystMessage } from "@/server/services/console.ts";

export async function POST(request: Request, context: { params: Promise<{ conversationId: string }> }): Promise<Response> {
  try {
    const analyst = await requireUser("analyst");
    const { conversationId } = await context.params;
    const body = await readJson<{ message?: unknown }>(request);
    if (typeof body.message !== "string") return Response.json({ error: "Informe uma mensagem.", code: "INVALID_INPUT" }, { status: 400 });
    const message = sendAnalystMessage(getDatabase(), analyst, conversationId, body.message);
    return Response.json({ message });
  } catch (error) {
    return errorResponse(error);
  }
}
