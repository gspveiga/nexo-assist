import { requireUser } from "@/server/auth/current-user.ts";
import { assertSameOrigin, errorResponse } from "@/server/api.ts";
import { getDatabase, listMessages } from "@/server/db/database.ts";
import { assertRateLimit } from "@/server/rate-limit.ts";
import { closeConversation } from "@/server/services/console.ts";

export async function POST(request: Request, context: { params: Promise<{ conversationId: string }> }): Promise<Response> {
  try {
    assertSameOrigin(request);
    const analyst = await requireUser("analyst");
    assertRateLimit("console", analyst.id, 40);
    const { conversationId } = await context.params;
    const db = await getDatabase();
    const conversation = await closeConversation(db, analyst, conversationId);
    return Response.json({ conversation, messages: await listMessages(db, conversation.id) });
  } catch (error) {
    return errorResponse(error);
  }
}
