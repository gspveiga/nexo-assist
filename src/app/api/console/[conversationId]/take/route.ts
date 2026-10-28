import { requireUser } from "@/server/auth/current-user.ts";
import { errorResponse } from "@/server/api.ts";
import { getDatabase, listMessages } from "@/server/db/database.ts";
import { takeConversation } from "@/server/services/console.ts";

export async function POST(_request: Request, context: { params: Promise<{ conversationId: string }> }): Promise<Response> {
  try {
    const analyst = await requireUser("analyst");
    const { conversationId } = await context.params;
    const db = getDatabase();
    const conversation = takeConversation(db, analyst, conversationId);
    return Response.json({ conversation, messages: listMessages(db, conversation.id) });
  } catch (error) {
    return errorResponse(error);
  }
}
