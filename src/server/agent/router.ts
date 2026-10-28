import type { ConversationState, Ticket, TicketDraft } from "@/shared/types";
import { searchKnowledge } from "../services/knowledge.ts";
import type { SqlDatabase } from "../db/database.ts";

export type Intent = "faq" | "lookup" | "update" | "create" | "handoff" | "out_of_scope" | "unknown";
export interface IntentDecision {
  intent: Intent;
  query: string;
  ticketNumber: string | null;
  reason: string;
  confidence: number;
  mode: "local" | "mastra";
}

const normalize = (text: string): string => text.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function extractTicketNumber(text: string): string | null {
  return text.toUpperCase().match(/\b(?:INC|REQ)-\d{4,6}\b/)?.[0] ?? null;
}

export function looksLikeConfirmation(text: string): boolean {
  return /^(confirmar|confirmo|sim|pode criar|pode atualizar|está correto|esta correto|isso mesmo|ok|certo)[.!\s]*$/i.test(text.trim());
}

export function looksLikeCancellation(text: string): boolean {
  return /^(cancelar|cancela|não|nao|deixa pra lá|deixa para la)[.!\s]*$/i.test(text.trim());
}

export function isOutOfScope(text: string): boolean {
  const value = normalize(text);
  return /\b(ferias|holerite|folha de pagamento|reembolso|nota fiscal|ar condicionado|limpeza|beneficio|plano de saude|rh|facilities)\b/.test(value);
}

export function localRoute(text: string, db: SqlDatabase): IntentDecision {
  const value = normalize(text);
  const ticketNumber = extractTicketNumber(text);
  if (/(analista|atendente|pessoa|humano|falar com alguem|quero falar)/.test(value)) {
    return { intent: "handoff", query: text, ticketNumber, reason: "O funcionário pediu atendimento humano.", confidence: 0.98, mode: "local" };
  }
  if (isOutOfScope(text)) {
    return { intent: "out_of_scope", query: text, ticketNumber, reason: "O assunto informado está fora do escopo de TI.", confidence: 0.95, mode: "local" };
  }
  if (/(\bcomplementar\b|\bcomplemento\b|\b(adicionar|acrescentar|incluir)\b.{0,50}\b(chamado|informacao|inc-|req-)\b|\b(atualizar|atualize|atualizacao)\b.{0,30}\b(chamado|inc-|req-)\b)/.test(value)) {
    return { intent: "update", query: text, ticketNumber, reason: "A mensagem pede complemento de um chamado.", confidence: 0.91, mode: "local" };
  }
  if (/(status|andamento|atrasad|meus chamados|meu chamado|chamado aberto|consultar chamado|acompanhar chamado)/.test(value) || ticketNumber) {
    return { intent: "lookup", query: text, ticketNumber, reason: "A mensagem pede consulta de chamado.", confidence: 0.9, mode: "local" };
  }

  const matches = searchKnowledge(db, text);
  const asksForHelp = /\b(como|qual|onde|horario|horarios|senha|erro|configur|instal|reset|acessar)\b/.test(value);
  const reportsIssue = /(nao funciona|nao conecta|parou|aparece o erro|recebo o erro|travando|bloquead|lento|indisponivel|sem acesso|nao sincroniza)/.test(value);
  if (matches.length > 0 && asksForHelp && !reportsIssue) {
    return { intent: "faq", query: text, ticketNumber, reason: "Há conteúdo da central de ajuda relacionado à pergunta.", confidence: 0.86, mode: "local" };
  }

  const asksToCreate = /(abrir chamado|abrir|criar|registrar|novo chamado|reportar|solicito|solicitar|preciso abrir|preciso de|quero um)/.test(value);
  if (asksToCreate || reportsIssue) {
    return { intent: "create", query: text, ticketNumber, reason: "A mensagem descreve uma falha ou solicita um novo serviço.", confidence: reportsIssue ? 0.82 : 0.88, mode: "local" };
  }
  if (matches.length > 0) {
    return { intent: "faq", query: text, ticketNumber, reason: "A busca encontrou um artigo possivelmente relevante.", confidence: 0.64, mode: "local" };
  }
  return { intent: "unknown", query: text, ticketNumber, reason: "Não há sinais suficientes para escolher uma ação com segurança.", confidence: 0.42, mode: "local" };
}

export async function routeMessage(
  text: string,
  db: SqlDatabase,
  context: { state: ConversationState; draft: TicketDraft | null; recentMessages: string[] },
): Promise<IntentDecision> {
  if (context.state !== "agent" || context.draft) return localRoute(text, db);
  if (process.env.NEXO_AGENT_MODE !== "mastra" || !process.env.OPENAI_API_KEY) return localRoute(text, db);
  try {
    const { routeWithMastra } = await import("./mastra-router.ts");
    const decision = await routeWithMastra(text, context.recentMessages);
    if (decision.confidence < 0.55) return localRoute(text, db);
    return { ...decision, mode: "mastra" };
  } catch (error) {
    console.error("Mastra não respondeu; usando roteamento local:", error instanceof Error ? error.message : error);
    return localRoute(text, db);
  }
}

export function openTickets(tickets: Ticket[]): Ticket[] {
  return tickets.filter((ticket) => !["Resolvido", "Fechado", "Cancelado", "Rejeitado"].includes(ticket.status));
}

export function isResolvedWithinSevenDays(ticket: Ticket, now = new Date()): boolean {
  if (ticket.status !== "Resolvido") return false;
  return now.getTime() - new Date(ticket.updatedAt).getTime() <= 7 * 24 * 60 * 60_000;
}

export function priorityColor(priority: Ticket["priority"]): string {
  return priority === "Crítica" || priority === "Alta" ? "amber" : priority === "Média" ? "blue" : "green";
}
