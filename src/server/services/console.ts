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

function assertConversation(db: SqlDatabase, conversationId: string): Conversation {
  const conversation = findConversationById(db, conversationId);
  if (!conversation) throw new ServiceError("Conversa não encontrada.", 404, "CONVERSATION_NOT_FOUND");
  return conversation;
}

export function getConsoleQueue(db: SqlDatabase, analyst: User) {
  assertAnalyst(analyst);
  return listQueueConversations(db).map((conversation) => {
    const owner = findUserById(db, conversation.userId);
    const messages = listMessages(db, conversation.id);
    const tickets = listAllTickets(db).filter((ticket) => ticket.ownerId === conversation.userId);
    return { conversation, owner, messages, tickets };
  });
}

export function takeConversation(db: SqlDatabase, analyst: User, conversationId: string): Conversation {
  assertAnalyst(analyst);
  const result = db.prepare(`
    UPDATE conversations SET state = 'human', assigned_analyst_id = ?, updated_at = ?
    WHERE id = ? AND state = 'waiting'
  `).run(analyst.id, new Date().toISOString(), conversationId);
  if (Number(result.changes) !== 1) {
    const current = assertConversation(db, conversationId);
    throw new ServiceError(
      current.assignedAnalystId ? "Outro analista já assumiu esta conversa." : "A conversa não está aguardando atendimento.",
      409,
      "CONVERSATION_NOT_AVAILABLE",
    );
  }
  recordConversationEvent(db, conversationId, analyst.id, "analyst_assumed", { analystName: analyst.name });
  const owner = findUserById(db, assertConversation(db, conversationId).userId);
  addMessage(db, {
    conversationId,
    senderId: null,
    senderRole: "system",
    body: `${analyst.name} assumiu o atendimento. O Nexo Assist está pausado.`,
    actions: [],
    decision: null,
  });
  void owner;
  return assertConversation(db, conversationId);
}

export function returnConversationToAgent(db: SqlDatabase, analyst: User, conversationId: string): Conversation {
  assertAnalyst(analyst);
  const conversation = assertConversation(db, conversationId);
  if (conversation.state === "human" && conversation.assignedAnalystId !== analyst.id) {
    throw new ServiceError("Somente o analista responsável pode devolver a conversa ao agente.", 403, "NOT_ASSIGNED_ANALYST");
  }
  if (conversation.state !== "human" && conversation.state !== "waiting") {
    throw new ServiceError("Esta conversa não pode ser devolvida ao agente agora.", 409, "CONVERSATION_NOT_WAITING");
  }
  updateConversation(db, conversationId, { state: "agent", assignedAnalystId: null, handoffReason: null, handoffSummary: null });
  recordConversationEvent(db, conversationId, analyst.id, "returned_to_agent");
  addMessage(db, {
    conversationId,
    senderId: analyst.id,
    senderRole: "system",
    body: `${analyst.name} devolveu a conversa ao Nexo Assist.`,
    actions: [],
    decision: null,
  });
  return assertConversation(db, conversationId);
}

export function closeConversation(db: SqlDatabase, analyst: User, conversationId: string): Conversation {
  assertAnalyst(analyst);
  const conversation = assertConversation(db, conversationId);
  if (conversation.state !== "human" || conversation.assignedAnalystId !== analyst.id) {
    throw new ServiceError("Somente o analista responsável pode encerrar esta conversa.", 403, "NOT_ASSIGNED_ANALYST");
  }
  updateConversation(db, conversationId, { state: "closed" });
  recordConversationEvent(db, conversationId, analyst.id, "conversation_closed");
  addMessage(db, {
    conversationId,
    senderId: analyst.id,
    senderRole: "system",
    body: "Atendimento encerrado pelo analista.",
    actions: [],
    decision: null,
  });
  return assertConversation(db, conversationId);
}

export function sendAnalystMessage(db: SqlDatabase, analyst: User, conversationId: string, body: string) {
  assertAnalyst(analyst);
  const text = body.trim();
  if (!text || text.length > 2000) throw new ServiceError("A mensagem deve ter entre 1 e 2.000 caracteres.");
  const conversation = assertConversation(db, conversationId);
  if (conversation.state !== "human" || conversation.assignedAnalystId !== analyst.id) {
    throw new ServiceError("Assuma esta conversa antes de responder.", 409, "CONVERSATION_NOT_ASSIGNED");
  }
  const message = addMessage(db, {
    conversationId,
    senderId: analyst.id,
    senderRole: "analyst",
    body: text,
    actions: [],
    decision: null,
  });
  updateConversation(db, conversationId, { state: "human" });
  recordConversationEvent(db, conversationId, analyst.id, "analyst_message_sent");
  return message;
}
