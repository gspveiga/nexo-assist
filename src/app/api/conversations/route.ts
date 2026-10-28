import { getCurrentUser, requireUser } from "@/server/auth/current-user.ts";
import { errorResponse } from "@/server/api.ts";
import { getDatabase, listConversationsForUser } from "@/server/db/database.ts";
import { deleteConversationForUser, getConversationForUser, newConversation } from "@/server/services/chat.ts";
import { ServiceError } from "@/server/services/errors.ts";

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireUser("employee");
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (id) return Response.json(getConversationForUser(getDatabase(), id, user));
    return Response.json({ conversations: listConversationsForUser(getDatabase(), user.id) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(): Promise<Response> {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "employee") throw new ServiceError("Faça login como funcionário para continuar.", 401, "AUTH_REQUIRED");
    const conversation = newConversation(getDatabase(), user);
    return Response.json({ conversation }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    const user = await requireUser("employee");
    const id = new URL(request.url).searchParams.get("id");
    if (!id) throw new ServiceError("Informe qual conversa deseja excluir.", 400, "CONVERSATION_ID_REQUIRED");
    deleteConversationForUser(getDatabase(), id, user);
    return Response.json({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
