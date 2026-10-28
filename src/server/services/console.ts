import type { Conversation, User } from "@/shared/types";
import {
  addMessage,
  findConversationById,
  findUserById,
  listAllTickets,
  listMessages,
  listQueueConversations,
  recordConversationEvent,
  type SqlDatabase,
  updateConversation,
} from "../db/database.ts";
import { ServiceError } from "./errors.ts";

function assertAnalyst(analyst: User): void {
  if (analyst.role !== "analyst") throw new ServiceError("Apenas analistas podem acessar o console.", 403, "FORBIDDEN");
}

async function assertConversation(db: SqlDatabase, conversationId: string): Promise<Conversation> {
  const conversation = await findConversationById(db, conversationId);
  if (!conversation) throw new ServiceError("Conversa não encontrada.", 404, "CONVERSATION_NOT_FOUND");
  return conversation;
}

export async function getConsoleQueue(db: SqlDatabase, analyst: User) {
  assertAnalyst(analyst);
  const [conversations, allTickets] = await Promise.all([listQueueConversations(db), listAllTickets(db)]);
  return Promise.all(conversations.map(async (conversation) => {
    const [owner, messages] = await Promise.all([
      findUserById(db, conversation.userId),
      listMessages(db, conversation.id),
    ]);
    const tickets = allTickets.filter((ticket) => ticket.ownerId === conversation.userId);
    return { conversation, owner, messages, tickets };
  }));
}

export async function takeConversation(db: SqlDatabase, analyst: User, conversationId: string): Promise<Conversation> {
  assertAnalyst(analyst);
  const result = await db.prepare(`
    UPDATE conversations SET state = 'human', assigned_analyst_id = ?, updated_at = ?
    WHERE id = ? AND state = 'waiting'
  `).run(analyst.id, new Date().toISOString(), conversationId);
  if (Number(result.changes) !== 1) {
    const current = await assertConversation(db, conversationId);
    throw new ServiceError(
      current.assignedAnalystId ? "Outro analista já assumiu esta conversa." : "A conversa não está aguardando atendimento.",
      409,
      "CONVERSATION_NOT_AVAILABLE",
    );
  }
  await recordConversationEvent(db, conversationId, analyst.id, "analyst_assumed", { analystName: analyst.name });
  const current = await assertConversation(db, conversationId);
  const owner = await findUserById(db, current.userId);
  await addMessage(db, {
    conversationId,
    senderId: null,
    senderRole: "system",
    body: `${analyst.name} assumiu o atendimento. O Nexo Assist está pausado.`,
    actions: [],
    decision: null,
  });
  void owner;
  return await assertConversation(db, conversationId);
}

export async function returnConversationToAgent(db: SqlDatabase, analyst: User, conversationId: string): Promise<Conversation> {
  assertAnalyst(analyst);
  const conversation = await assertConversation(db, conversationId);
  if (conversation.state === "human" && conversation.assignedAnalystId !== analyst.id) {
    throw new ServiceError("Somente o analista responsável pode devolver a conversa ao agente.", 403, "NOT_ASSIGNED_ANALYST");
  }
  if (conversation.state !== "human" && conversation.state !== "waiting") {
    throw new ServiceError("Esta conversa não pode ser devolvida ao agente agora.", 409, "CONVERSATION_NOT_WAITING");
  }
  await updateConversation(db, conversationId, { state: "agent", assignedAnalystId: null, handoffReason: null, handoffSummary: null });
  await recordConversationEvent(db, conversationId, analyst.id, "returned_to_agent");
  await addMessage(db, {
    conversationId,
    senderId: analyst.id,
    senderRole: "system",
    body: `${analyst.name} devolveu a conversa ao Nexo Assist.`,
    actions: [],
    decision: null,
  });
  return await assertConversation(db, conversationId);
}

export async function closeConversation(db: SqlDatabase, analyst: User, conversationId: string): Promise<Conversation> {
  assertAnalyst(analyst);
  const conversation = await assertConversation(db, conversationId);
  if (conversation.state !== "human" || conversation.assignedAnalystId !== analyst.id) {
    throw new ServiceError("Somente o analista responsável pode encerrar esta conversa.", 403, "NOT_ASSIGNED_ANALYST");
  }
  await updateConversation(db, conversationId, { state: "closed" });
  await recordConversationEvent(db, conversationId, analyst.id, "conversation_closed");
  await addMessage(db, {
    conversationId,
    senderId: analyst.id,
    senderRole: "system",
    body: "Atendimento encerrado pelo analista.",
    actions: [],
    decision: null,
  });
  return await assertConversation(db, conversationId);
}

export async function sendAnalystMessage(db: SqlDatabase, analyst: User, conversationId: string, body: string) {
  assertAnalyst(analyst);
  const text = body.trim();
  if (!text || text.length > 2000) throw new ServiceError("A mensagem deve ter entre 1 e 2.000 caracteres.");
  const conversation = await assertConversation(db, conversationId);
  if (conversation.state !== "human" || conversation.assignedAnalystId !== analyst.id) {
    throw new ServiceError("Assuma esta conversa antes de responder.", 409, "CONVERSATION_NOT_ASSIGNED");
  }
  const message = await addMessage(db, {
    conversationId,
    senderId: analyst.id,
    senderRole: "analyst",
    body: text,
    actions: [],
    decision: null,
  });
  await updateConversation(db, conversationId, { state: "human" });
  await recordConversationEvent(db, conversationId, analyst.id, "analyst_message_sent");
  return message;
}
