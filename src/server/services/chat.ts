import type {
  AffectedScope,
  ChatMessage,
  Conversation,
  DecisionTrace,
  QuickAction,
  Ticket,
  TicketDraft,
  User,
} from "@/shared/types";
import {
  addMessage,
  createTicketRecord,
  findConversationById,
  findTicketById,
  findTicketByNumber,
  incrementSessionCount,
  listArticles,
  listMessages,
  listTickets,
  newId,
  nowIso,
  recordConversationEvent,
  type SqlDatabase,
  updateConversation,
  updateTicketRecord,
} from "../db/database.ts";
import { inferAffectedScope, inferCategory, inferPriority, inferType, makeTicketTitle, similarity } from "./classification.ts";
import { searchKnowledge } from "./knowledge.ts";
import { calculateSlaDueAt, formatDateTime, formatShortDate, isOverdue, prioritySlaLabel } from "./sla.ts";
import { AgentProviderError, extractTicketNumber, isOutOfScope, looksLikeCancellation, looksLikeConfirmation, openTickets, routeMessage } from "../agent/router.ts";
import { ServiceError } from "./errors.ts";

const maxMessageLength = 2000;
const sessionMessageLimit = 30;
const activeStatuses = new Set(["Novo", "Aberto", "Em andamento", "Aguardando analista", "Aguardando aprovação", "Aprovado", "Reaberto"]);

function normalized(text: string): string {
  return text.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function quick(label: string, value: string): QuickAction {
  return { label, value };
}

function assertOwnedConversation(db: SqlDatabase, conversationId: string, user: User): Conversation {
  const conversation = findConversationById(db, conversationId);
  if (!conversation || conversation.userId !== user.id) throw new ServiceError("Conversa não encontrada.", 404, "CONVERSATION_NOT_FOUND");
  return conversation;
}

function makeTrace(intent: string, action: string, confidence: number, reason: string, tool: string, outcome: DecisionTrace["outcome"] = "success"): DecisionTrace {
  return { intent, action, confidence, reason, tool, outcome };
}

function reply(
  db: SqlDatabase,
  conversationId: string,
  body: string,
  decision: DecisionTrace,
  actions: QuickAction[] = [],
  payload?: ChatMessage["payload"],
): ChatMessage {
  const message = addMessage(db, {
    conversationId,
    senderId: null,
    senderRole: "assistant",
    body,
    actions,
    decision,
    payload,
  });
  incrementSessionCount(db, conversationId);
  return message;
}

function actionMessage(raw: string): { command: string; value?: string } {
  const match = raw.match(/^(consultar|complementar|transferir|abrir|abrangencia|scope|faq):(.+)$/i);
  if (!match) return { command: raw };
  return { command: match[1].toLocaleLowerCase("pt-BR"), value: match[2] };
}

function getOpenTicketById(db: SqlDatabase, userId: string, id: string): Ticket | null {
  const ticket = findTicketById(db, id);
  if (!ticket || ticket.ownerId !== userId) return null;
  return ticket;
}

function findSimilarActiveTicket(db: SqlDatabase, user: User, text: string, category: Ticket["category"]): Ticket | null {
  return listTickets(db, user.id)
    .filter((ticket) => activeStatuses.has(ticket.status) && ticket.category === category)
    .map((ticket) => ({ ticket, score: similarity(text, `${ticket.title} ${ticket.description}`) }))
    .filter((item) => item.score >= 0.35)
    .sort((a, b) => b.score - a.score)[0]?.ticket ?? null;
}

function findSimilarRecentlyResolved(db: SqlDatabase, user: User, text: string, category: Ticket["category"]): Ticket | null {
  const now = Date.now();
  return listTickets(db, user.id)
    .filter((ticket) => ticket.status === "Resolvido" && ticket.category === category && now - new Date(ticket.updatedAt).getTime() <= 7 * 24 * 60 * 60_000)
    .map((ticket) => ({ ticket, score: similarity(text, `${ticket.title} ${ticket.description}`) }))
    .filter((item) => item.score >= 0.3)
    .sort((a, b) => b.score - a.score)[0]?.ticket ?? null;
}

function needsDescription(text: string): boolean {
  return /^(preciso abrir( um)? chamado|abrir( um)? chamado|novo chamado|quero abrir( um)? chamado|preciso de ajuda|ajuda com ti)[.!\s]*$/i.test(text.trim());
}

function updateNoteFromText(text: string, ticketNumber: string | null): string {
  let note = ticketNumber ? text.replace(new RegExp(ticketNumber, "ig"), " ") : text;
  note = note.replace(/^\s*(quero\s+)?(complementar|atualizar|adicionar informa(?:ção|cao)|acrescentar|incluir)\s*(o\s+chamado)?\s*/i, "");
  note = note.replace(/^\s*(com|que|sobre)\s+/i, "").replace(/^\s*[:,-]+\s*/, "").trim();
  return note.length >= 3 ? note : "";
}

function makeDraft(userText: string, user: User, db: SqlDatabase, scope = inferAffectedScope(userText)): TicketDraft {
  const category = inferCategory(userText);
  const type = inferType(userText);
  const priority = inferPriority(userText, scope, type);
  const similar = findSimilarActiveTicket(db, user, userText, category);
  if (similar) {
    return {
      operation: "update",
      ticketId: similar.id,
      ticketNumber: similar.number,
      title: similar.title,
      description: similar.description,
      type: similar.type,
      category: similar.category,
      priority: similar.priority,
      affectedScope: similar.affectedScope,
      pendingNote: userText,
      sourceMessage: userText,
      reason: `Já existe um chamado aberto relacionado (${similar.number}); vou complementar esse registro para evitar duplicidade.`,
    };
  }
  const resolved = findSimilarRecentlyResolved(db, user, userText, category);
  if (resolved) {
    return {
      operation: "reopen",
      ticketId: resolved.id,
      ticketNumber: resolved.number,
      title: resolved.title,
      description: resolved.description,
      type: resolved.type,
      category: resolved.category,
      priority: resolved.priority,
      affectedScope: resolved.affectedScope,
      pendingNote: userText,
      sourceMessage: userText,
      reason: `O chamado ${resolved.number} foi resolvido há menos de 7 dias e pode ser reaberto.`,
    };
  }
  return {
    operation: "create",
    title: makeTicketTitle(userText, category),
    description: userText.trim(),
    type,
    category,
    priority,
    affectedScope: scope,
    sourceMessage: userText,
    reason: "A descrição e a categoria foram extraídas da mensagem; o impacto e a urgência definem a prioridade.",
    awaitingDescription: needsDescription(userText),
  };
}

function scopeActions(): QuickAction[] {
  return [
    quick("Só eu", "abrangencia:Só você"),
    quick("Minha equipe", "abrangencia:Minha equipe"),
    quick("Toda a empresa", "abrangencia:Toda a empresa"),
    quick("Não sei", "abrangencia:Não sei"),
  ];
}

function draftActions(): QuickAction[] {
  const actions = [quick("Confirmar", "confirmar"), quick("Editar", "editar"), quick("Cancelar", "cancelar")];
  return actions;
}

function presentDraft(db: SqlDatabase, conversationId: string, draft: TicketDraft): ChatMessage {
  updateConversation(db, conversationId, { draft });
  if (draft.awaitingDescription) {
    return reply(
      db,
      conversationId,
      "O que está acontecendo ou o que você precisa solicitar? Uma frase com o sistema e o erro já ajuda.",
      makeTrace("abertura", "coletou_descricao", 0.86, "Ainda falta uma descrição concreta do problema ou pedido.", "validar_entrada", "needs_input"),
    );
  }
  if (draft.awaitingNote) {
    return reply(
      db,
      conversationId,
      `O chamado ${draft.ticketNumber} pertence a você. O que devo adicionar ao histórico? Vou mostrar a atualização para confirmação antes de salvar.`,
      makeTrace("complemento", "solicitou_detalhe", 0.96, "O usuário escolheu complementar um chamado próprio.", "localizar_chamado", "needs_input"),
    );
  }
  if (!draft.affectedScope && draft.operation === "create") {
    return reply(
      db,
      conversationId,
      "Quem está sendo afetado por esse problema?",
      makeTrace("abertura", "coletou_impacto", 0.82, "A abrangência não ficou clara na mensagem inicial.", "classificar_chamado", "needs_input"),
      scopeActions(),
      { draft },
    );
  }
  const prefix = draft.operation === "create" ? "Novo chamado" : draft.operation === "reopen" ? "Reabrir chamado" : "Complementar chamado";
  const summary = draft.operation === "create"
    ? draft.description
    : `${draft.description}\n\nNova informação: ${draft.pendingNote ?? ""}`;
  return reply(
    db,
    conversationId,
    `${draft.reason}\n\nConfira o rascunho antes de confirmar:`,
    makeTrace("abertura", "montou_rascunho", 0.9, draft.reason, "validar_e_montar_rascunho", "needs_input"),
      draftActions(),
    { draft: { ...draft, description: summary, reason: `${prefix} · ${draft.reason}` } },
  );
}

function nextTicketNumber(db: SqlDatabase, type: Ticket["type"]): string {
  const rows = db.prepare("SELECT number FROM tickets WHERE number LIKE ?").all(`${type}-%`) as Array<{ number: string }>;
  const firstNumber = type === "INC" ? 20500 : 10442;
  const highest = rows.reduce((maximum, row) => Math.max(maximum, Number(row.number.split("-")[1]) || 0), firstNumber);
  return `${type}-${highest + 1}`;
}

function handoffSummary(db: SqlDatabase, conversationId: string, user: User, reason: string, ticket?: Ticket): string {
  const recent = listMessages(db, conversationId).slice(-8).map((message) => `${message.senderRole}: ${message.body}`).join("\n");
  return [
    `Solicitante: ${user.name} (${user.department}).`,
    ticket ? `Chamado relacionado: ${ticket.number} · ${ticket.title} · ${ticket.priority}.` : "",
    `Motivo: ${reason}`,
    "Resumo recente:",
    recent,
  ].filter(Boolean).join("\n");
}

function transferToHuman(
  db: SqlDatabase,
  conversation: Conversation,
  user: User,
  reason: string,
  confidence: number,
  ticket?: Ticket,
  notify = true,
): void {
  const summary = handoffSummary(db, conversation.id, user, reason, ticket);
  updateConversation(db, conversation.id, {
    state: "waiting",
    handoffReason: reason,
    handoffSummary: summary,
    activeTicketId: ticket?.id ?? conversation.activeTicketId,
    assignedAnalystId: null,
  });
  recordConversationEvent(db, conversation.id, user.id, "transferred", { reason, ticketNumber: ticket?.number ?? null, confidence });
  if (notify) {
    reply(
      db,
      conversation.id,
      `Encaminhei sua conversa para o Suporte N2${ticket ? `, junto com o chamado ${ticket.number}` : ""}. Um analista vai continuar o atendimento. O Nexo Assist ficará pausado até alguém assumir.`,
      makeTrace("escalonamento", "transferiu_para_analista", confidence, reason, "transferir_conversa"),
      [],
    );
  }
}

function createOrUpdateDraft(db: SqlDatabase, conversation: Conversation, user: User, text: string): ChatMessage {
  const draft = makeDraft(text, user, db);
  if (draft.operation !== "create" && draft.affectedScope) draft.awaitingNote = false;
  return presentDraft(db, conversation.id, draft);
}

function findTicketFromText(db: SqlDatabase, user: User, ticketNumber: string | null): Ticket | null {
  return ticketNumber ? findTicketByNumber(db, user.id, ticketNumber) : null;
}

function ticketStatusLine(ticket: Ticket): string {
  const overdue = isOverdue(ticket.slaDueAt) && activeStatuses.has(ticket.status);
  return `${ticket.number} · ${ticket.status}${overdue ? " · prazo vencido" : ` · atualização ${formatShortDate(ticket.updatedAt)}`}`;
}

function ticketCardActions(ticket: Ticket): QuickAction[] {
  const actions = [quick("Ver detalhes", `consultar:${ticket.number}`)];
  if (activeStatuses.has(ticket.status)) actions.push(quick("Adicionar informação", `complementar:${ticket.number}`));
  if (isOverdue(ticket.slaDueAt) && activeStatuses.has(ticket.status)) actions.push(quick("Falar com um analista", `transferir:${ticket.number}`));
  return actions;
}

function showTicket(db: SqlDatabase, conversationId: string, ticket: Ticket): ChatMessage {
  const overdue = isOverdue(ticket.slaDueAt) && activeStatuses.has(ticket.status);
  const body = overdue
    ? `${ticketStatusLine(ticket)}. Está sem atualização desde ${formatShortDate(ticket.updatedAt)}, acima do prazo da prioridade ${ticket.priority.toLocaleLowerCase("pt-BR")}. Quer que eu chame um analista?`
    : `${ticketStatusLine(ticket)}. ${ticket.lastUpdateSummary || "Não há novas informações registradas."}`;
  return reply(
    db,
    conversationId,
    body,
    makeTrace("consulta", "consultou_chamado", 0.95, `Consulta limitada ao titular do chamado ${ticket.number}.`, "consultar_chamado"),
    ticketCardActions(ticket),
    { ticket },
  );
}

function listUserTickets(db: SqlDatabase, conversationId: string, user: User): ChatMessage {
  const tickets = openTickets(listTickets(db, user.id));
  if (!tickets.length) {
    return reply(
      db,
      conversationId,
      "Não encontrei chamados abertos em seu nome. Posso procurar uma resposta na central de ajuda ou ajudar a abrir um chamado.",
      makeTrace("consulta", "listou_chamados", 0.93, "A consulta retornou zero chamados abertos para o usuário autenticado.", "consultar_meus_chamados"),
      [quick("Abrir chamado", "abrir:novo"), quick("Central de ajuda", "faq:ajuda")],
    );
  }
  if (tickets.length === 1) return showTicket(db, conversationId, tickets[0]);
  return reply(
    db,
    conversationId,
    `Você tem ${tickets.length} chamados em andamento. Sobre qual deles quer saber?`,
    makeTrace("consulta", "listou_chamados", 0.96, "Os chamados foram filtrados pelo funcionário autenticado.", "consultar_meus_chamados"),
    tickets.map((ticket) => quick(`${ticket.number} · ${ticket.title}`, `consultar:${ticket.number}`)),
    { tickets },
  );
}

function askUpdateTarget(db: SqlDatabase, conversationId: string, user: User, number: string | null): ChatMessage {
  const ticket = findTicketFromText(db, user, number);
  if (number && !ticket) {
    return reply(
      db,
      conversationId,
      "Não encontrei esse chamado entre os registros da sua conta. Confira o número ou consulte seus chamados.",
      makeTrace("complemento", "rejeitou_chamado", 0.96, "O chamado não existe para o usuário autenticado.", "validar_titularidade", "blocked"),
      [quick("Consultar meus chamados", "consultar:lista")],
    );
  }
  if (ticket) {
    if (ticket.status === "Resolvido" && Date.now() - new Date(ticket.updatedAt).getTime() > 7 * 24 * 60 * 60_000) {
      return reply(
        db,
        conversationId,
        `O chamado ${ticket.number} foi resolvido há mais de 7 dias. Posso abrir um novo chamado com essa informação.`,
        makeTrace("complemento", "bloqueou_reabertura", 0.95, "A regra permite reabrir chamados resolvidos apenas dentro de 7 dias.", "validar_prazo_reabertura", "blocked"),
        [quick("Abrir novo chamado", "abrir:novo")],
      );
    }
    const draft: TicketDraft = {
      operation: ticket.status === "Resolvido" ? "reopen" : "update",
      ticketId: ticket.id,
      ticketNumber: ticket.number,
      title: ticket.title,
      description: ticket.description,
      type: ticket.type,
      category: ticket.category,
      priority: ticket.priority,
      affectedScope: ticket.affectedScope,
      awaitingNote: true,
      sourceMessage: "",
      reason: ticket.status === "Resolvido" ? "Chamado resolvido recentemente; a confirmação reabrirá o mesmo registro." : "A atualização será anexada ao chamado existente após sua confirmação.",
    };
    return presentDraft(db, conversationId, draft);
  }
  const tickets = openTickets(listTickets(db, user.id));
  if (tickets.length === 1) return askUpdateTarget(db, conversationId, user, tickets[0].number);
  if (tickets.length > 1) {
    return reply(
      db,
      conversationId,
      "Qual chamado quer complementar?",
      makeTrace("complemento", "solicitou_selecao", 0.88, "Há mais de um chamado aberto e não foi informado um número.", "consultar_meus_chamados", "needs_input"),
      tickets.map((item) => quick(`${item.number} · ${item.title}`, `complementar:${item.number}`)),
      { tickets },
    );
  }
  return reply(
    db,
    conversationId,
    "Não encontrei chamados abertos em seu nome. Se quiser, descreva o problema e posso montar um novo rascunho.",
    makeTrace("complemento", "nenhum_chamado", 0.95, "Não há chamado aberto elegível para receber a informação.", "consultar_meus_chamados", "needs_input"),
    [quick("Abrir chamado", "abrir:novo")],
  );
}

function beginUpdate(db: SqlDatabase, conversationId: string, user: User, number: string | null, text: string): ChatMessage {
  const ticket = findTicketFromText(db, user, number);
  if (!ticket) return askUpdateTarget(db, conversationId, user, number);
  if (ticket.status === "Resolvido" && Date.now() - new Date(ticket.updatedAt).getTime() > 7 * 24 * 60 * 60_000) {
    return askUpdateTarget(db, conversationId, user, number);
  }
  const pendingNote = updateNoteFromText(text, number);
  const draft: TicketDraft = {
    operation: ticket.status === "Resolvido" ? "reopen" : "update",
    ticketId: ticket.id,
    ticketNumber: ticket.number,
    title: ticket.title,
    description: ticket.description,
    type: ticket.type,
    category: ticket.category,
    priority: ticket.priority,
    affectedScope: ticket.affectedScope,
    pendingNote: pendingNote || undefined,
    awaitingNote: !pendingNote,
    sourceMessage: text,
    reason: ticket.status === "Resolvido" ? "Chamado resolvido recentemente; a confirmação reabrirá o mesmo registro." : "A informação será adicionada ao chamado existente após sua confirmação.",
  };
  return presentDraft(db, conversationId, draft);
}

function confirmDraft(db: SqlDatabase, conversation: Conversation, user: User, draft: TicketDraft): ChatMessage {
  if (!draft.title.trim() || !draft.description.trim() || !draft.category || !draft.type || !draft.priority) {
    throw new ServiceError("O rascunho ainda precisa de título, descrição, tipo, categoria e prioridade.");
  }
  if (draft.operation === "create" && !draft.affectedScope) {
    return reply(db, conversation.id, "Antes de confirmar, preciso saber quem está sendo afetado.", makeTrace("abertura", "coletou_impacto", 0.9, "A abrangência é obrigatória no chamado.", "validar_rascunho", "needs_input"), scopeActions());
  }
  if (draft.operation === "create") {
    const duplicate = findSimilarActiveTicket(db, user, draft.sourceMessage, draft.category);
    if (duplicate) {
      const update: TicketDraft = {
        ...draft,
        operation: "update",
        ticketId: duplicate.id,
        ticketNumber: duplicate.number,
        title: duplicate.title,
        description: duplicate.description,
        type: duplicate.type,
        category: duplicate.category,
        priority: duplicate.priority,
        affectedScope: duplicate.affectedScope,
        pendingNote: draft.sourceMessage,
        reason: `Antes de criar, encontrei o chamado aberto ${duplicate.number} para o mesmo assunto. Vou complementar esse chamado para não duplicar.`,
      };
      return presentDraft(db, conversation.id, update);
    }
    const number = nextTicketNumber(db, draft.type);
    const ticket = createTicketRecord(db, {
      number,
      ownerId: user.id,
      title: draft.title,
      description: draft.description,
      type: draft.type,
      category: draft.category,
      priority: draft.priority,
      status: "Novo",
      affectedScope: draft.affectedScope!,
      assignedGroup: draft.priority === "Crítica" ? "Suporte N2" : "Suporte N1",
      slaDueAt: calculateSlaDueAt(draft.priority),
    });
    recordConversationEvent(db, conversation.id, user.id, "ticket_created", { ticketNumber: ticket.number });
    updateConversation(db, conversation.id, { draft: null, activeTicketId: ticket.id });
    if (ticket.priority === "Crítica") {
      transferToHuman(db, { ...conversation, activeTicketId: ticket.id }, user, "O chamado foi classificado como crítico pelo impacto amplo e pela interrupção do serviço.", 0.96, ticket, false);
      return reply(
        db,
        conversation.id,
        `Pronto: criei o chamado ${ticket.number} com prioridade crítica e SLA de 1 hora. Também encaminhei a conversa ao Suporte N2.`,
        makeTrace("abertura", "criou_e_escalou", 0.96, "A operação foi salva; a prioridade crítica exige plantão humano.", "criar_chamado", "success"),
        [],
        { ticket },
      );
    }
    return reply(
      db,
      conversation.id,
      `Pronto: criei o chamado ${ticket.number} com prioridade ${ticket.priority.toLocaleLowerCase("pt-BR")}. ${prioritySlaLabel(ticket.priority)}.`,
      makeTrace("abertura", "criou_chamado", 0.96, "O funcionário confirmou o rascunho e o serviço de chamados retornou o registro persistido.", "criar_chamado"),
      [quick("Ver chamado", `consultar:${ticket.number}`)],
      { ticket },
    );
  }

  if (!draft.ticketId || !draft.ticketNumber || !draft.pendingNote?.trim()) {
    return reply(
      db,
      conversation.id,
      "Ainda preciso da informação que você quer adicionar ao chamado.",
      makeTrace("complemento", "solicitou_detalhe", 0.9, "Não há uma informação adicional no rascunho.", "validar_atualizacao", "needs_input"),
    );
  }
  const ticket = getOpenTicketById(db, user.id, draft.ticketId);
  if (!ticket) throw new ServiceError("Esse chamado não pertence à sua conta.", 403, "TICKET_FORBIDDEN");
  const reopening = draft.operation === "reopen";
  if (reopening && (ticket.status !== "Resolvido" || Date.now() - new Date(ticket.updatedAt).getTime() > 7 * 24 * 60 * 60_000)) {
    throw new ServiceError("O período permitido para reabrir esse chamado já passou.", 409, "REOPEN_WINDOW_EXPIRED");
  }
  const nextDescription = `${ticket.description}\n\nAtualização ${formatDateTime(nowIso())}: ${draft.pendingNote.trim()}`;
  const nextStatus = reopening ? "Reaberto" : undefined;
  updateTicketRecord(db, ticket.id, {
    description: nextDescription,
    summary: draft.pendingNote.trim(),
    status: nextStatus,
    slaDueAt: calculateSlaDueAt(ticket.priority),
  });
  recordConversationEvent(db, conversation.id, user.id, reopening ? "ticket_reopened" : "ticket_updated", { ticketNumber: ticket.number });
  const updated = findTicketById(db, ticket.id);
  if (!updated) throw new Error("A atualização foi gravada, mas o chamado não pôde ser recuperado.");
  updateConversation(db, conversation.id, { draft: null, activeTicketId: updated.id });
  return reply(
    db,
    conversation.id,
    `${reopening ? "Reabri" : "Atualizei"} o chamado ${updated.number}. ${prioritySlaLabel(updated.priority)} para a próxima atualização.`,
    makeTrace("complemento", reopening ? "reabriu_chamado" : "atualizou_chamado", 0.97, "A atualização foi confirmada e persistida no chamado do titular.", reopening ? "reabrir_chamado" : "complementar_chamado"),
    [quick("Ver chamado", `consultar:${updated.number}`)],
    { ticket: updated },
  );
}

function handlePendingDraft(db: SqlDatabase, conversation: Conversation, user: User, text: string): ChatMessage {
  const draft = conversation.draft!;
  if (looksLikeCancellation(text) || normalized(text).startsWith("cancelar:")) {
    updateConversation(db, conversation.id, { draft: null });
    return reply(db, conversation.id, "Cancelei o rascunho. Nenhum chamado foi criado ou alterado.", makeTrace("rascunho", "cancelou", 0.99, "Cancelamento solicitado pelo funcionário.", "cancelar_rascunho", "success"));
  }
  if (looksLikeConfirmation(text)) return confirmDraft(db, conversation, user, draft);
  if (draft.awaitingDescription) {
    return presentDraft(db, conversation.id, makeDraft(text, user, db, inferAffectedScope(text)));
  }
  if (draft.awaitingEdit) {
    if (draft.operation === "create") {
      const edited = makeDraft(text, user, db, inferAffectedScope(text) ?? draft.affectedScope);
      return presentDraft(db, conversation.id, edited);
    }
    const edited: TicketDraft = {
      ...draft,
      pendingNote: text.trim(),
      sourceMessage: text.trim(),
      awaitingNote: false,
      awaitingEdit: false,
      reason: `${draft.reason} O texto da atualização foi corrigido pelo funcionário e aguarda confirmação.`,
    };
    return presentDraft(db, conversation.id, edited);
  }

  const command = actionMessage(text);
  const scopeChoice = command.command === "abrangencia"
    ? command.value as AffectedScope
    : inferAffectedScope(text);
  if (draft.awaitingNote) {
    const next: TicketDraft = {
      ...draft,
      pendingNote: text.trim(),
      sourceMessage: text.trim(),
      awaitingNote: false,
      reason: `${draft.reason} A informação foi capturada e aguarda confirmação.`,
    };
    return presentDraft(db, conversation.id, next);
  }
  if (draft.operation === "create" && !draft.affectedScope && scopeChoice) {
    const next: TicketDraft = {
      ...draft,
      affectedScope: scopeChoice,
      priority: inferPriority(draft.sourceMessage, scopeChoice, draft.type),
    };
    return presentDraft(db, conversation.id, next);
  }
  if (normalized(text).startsWith("editar") || normalized(text).startsWith("edit")) {
    updateConversation(db, conversation.id, { draft: { ...draft, awaitingEdit: true } });
    return reply(db, conversation.id, draft.operation === "create"
      ? "Envie a descrição corrigida, incluindo o sistema, o erro, quem foi afetado e a urgência. Vou classificar novamente e mostrar outra prévia."
      : "Escreva novamente a informação que quer acrescentar ao chamado. Vou mostrar a correção antes de salvar.",
    makeTrace("rascunho", "solicitou_correcao", 0.92, "O funcionário pediu para editar os dados antes de confirmar.", "editar_rascunho", "needs_input"));
  }
  if (draft.operation === "create") {
    const next = { ...draft, description: `${draft.description}\n\nDetalhe: ${text.trim()}`, sourceMessage: `${draft.sourceMessage} ${text.trim()}` };
    return presentDraft(db, conversation.id, next);
  }
  const next = { ...draft, pendingNote: text.trim(), awaitingNote: false };
  return presentDraft(db, conversation.id, next);
}

function handleFaq(db: SqlDatabase, conversationId: string, text: string): ChatMessage {
  const faqCommand = text.match(/^faq:(.*)$/i)?.[1]?.trim();
  if (faqCommand?.toLocaleLowerCase("pt-BR") === "lista") {
    const articles = listArticles(db);
    return reply(
      db,
      conversationId,
      `Central de ajuda: ${articles.map((article) => article.title).join(" · ")}. Escolha um artigo para abrir.`,
      makeTrace("faq", "listou_artigos", 0.98, "A lista veio dos artigos cadastrados na central local.", "consultar_central_de_ajuda"),
      articles.map((article) => quick(article.title, `faq:${article.title}`)),
    );
  }
  const matches = searchKnowledge(db, faqCommand || text);
  if (!matches.length) {
    return reply(
      db,
      conversationId,
      "Não encontrei um artigo que responda a essa pergunta. Se você me contar o que acontece e quem está sendo afetado, preparo um rascunho de chamado.",
      makeTrace("faq", "busca_sem_resultado", 0.52, "Nenhum artigo da central atingiu o limite de relevância; nenhuma solução foi inventada.", "buscar_central_de_ajuda", "needs_input"),
      [quick("Abrir chamado", "abrir:novo"), quick("Falar com um analista", "falar com um analista")],
    );
  }
  const top = matches[0];
  if (top.score < 0.34) {
    return reply(
      db,
      conversationId,
      "Encontrei um artigo possivelmente relacionado, mas não tenho segurança de que responda ao seu caso. Quer falar com um analista?",
      makeTrace("faq", "resultado_incerto", 0.49, `O artigo “${top.article.title}” teve relevância baixa para a pergunta.`, "buscar_central_de_ajuda", "needs_input"),
      [quick("Falar com um analista", "falar com um analista"), quick("Tentar outra pergunta", "outra pergunta")],
      { },
    );
  }
  const related = matches.slice(1).map((match) => `\n\nTambém pode ajudar: ${match.article.title}. ${match.article.content}`).join("");
  return reply(
    db,
    conversationId,
    `${top.article.content}${related}`,
    makeTrace("faq", "consultou_central_de_ajuda", Math.min(0.97, 0.7 + top.score / 4), `A resposta veio do artigo “${top.article.title}” (${top.article.category}).`, "buscar_central_de_ajuda"),
    [quick("Ainda preciso de ajuda", "abrir:novo")],
  );
}

function handleTicketLookup(db: SqlDatabase, conversationId: string, user: User, text: string): ChatMessage {
  const number = extractTicketNumber(text);
  const ticket = findTicketFromText(db, user, number);
  if (number && !ticket) {
    return reply(
      db,
      conversationId,
      "Não encontrei esse número entre os chamados da sua conta. Por privacidade, só posso mostrar registros que pertencem a você.",
      makeTrace("consulta", "bloqueou_acesso", 0.99, "O número informado não corresponde a chamado do usuário autenticado.", "validar_titularidade", "blocked"),
    );
  }
  return ticket ? showTicket(db, conversationId, ticket) : listUserTickets(db, conversationId, user);
}

function handleHandoff(db: SqlDatabase, conversation: Conversation, user: User, reason: string, confidence: number, ticket?: Ticket): ChatMessage {
  transferToHuman(db, conversation, user, reason, confidence, ticket);
  return listMessages(db, conversation.id).at(-1)!;
}

function findTicketForTransfer(db: SqlDatabase, user: User, text: string): Ticket | undefined {
  const number = extractTicketNumber(text);
  return number ? findTicketByNumber(db, user.id, number) ?? undefined : undefined;
}

function startCreationFromQuickAction(db: SqlDatabase, conversation: Conversation, user: User, text: string): ChatMessage {
  const source = text.replace(/^(abrir|abrir chamado):/i, "").trim();
  const description = source && source.toLocaleLowerCase("pt-BR") !== "novo" ? source : "";
  if (!description) {
    return reply(
      db,
      conversation.id,
      "Descreva o que aconteceu ou o que você precisa. Vou conferir a categoria, prioridade e os dados antes de criar qualquer chamado.",
      makeTrace("abertura", "coletou_descricao", 0.96, "A descrição é necessária antes de montar o rascunho.", "validar_entrada", "needs_input"),
    );
  }
  return createOrUpdateDraft(db, conversation, user, description);
}

function findRecentMessages(db: SqlDatabase, conversationId: string): string[] {
  return listMessages(db, conversationId).slice(-10).map((message) => `${message.senderRole}: ${message.body}`);
}

export async function processUserMessage(
  db: SqlDatabase,
  user: User,
  conversationId: string,
  rawText: string,
): Promise<{ conversation: Conversation; messages: ChatMessage[] }> {
  const text = rawText.trim();
  if (!text) throw new ServiceError("Escreva uma mensagem antes de enviar.", 400, "MESSAGE_EMPTY");
  if (text.length > maxMessageLength) throw new ServiceError(`A mensagem deve ter até ${maxMessageLength} caracteres.`, 400, "MESSAGE_TOO_LONG");

  let conversation = assertOwnedConversation(db, conversationId, user);
  if (conversation.state !== "agent") throw new ServiceError("Esta conversa está com um analista e o Nexo Assist está pausado.", 409, "AGENT_PAUSED");
  if (conversation.sessionMessageCount >= sessionMessageLimit) throw new ServiceError("Esta sessão chegou ao limite de 30 mensagens. Inicie uma nova conversa para continuar.", 409, "SESSION_LIMIT_REACHED");

  addMessage(db, {
    conversationId,
    senderId: user.id,
    senderRole: "employee",
    body: text,
    actions: [],
    decision: null,
  });
  incrementSessionCount(db, conversationId);
  conversation = findConversationById(db, conversationId)!;

  try {
    const command = actionMessage(text);
    let response: ChatMessage;
    if (conversation.draft) {
      response = handlePendingDraft(db, conversation, user, text);
    } else if (command.command === "abrangencia") {
      response = reply(db, conversationId, "Não há rascunho ativo para informar a abrangência. Descreva o problema para começar.", makeTrace("abertura", "sem_rascunho", 0.9, "A escolha de abrangência não tem rascunho associado.", "validar_estado", "blocked"));
    } else if (command.command === "transferir") {
      const ticket = findTicketFromText(db, user, command.value ?? null);
      response = handleHandoff(db, conversation, user, "O funcionário escolheu falar com um analista.", 0.99, ticket ?? undefined);
    } else if (command.command === "consultar" && command.value?.toLocaleLowerCase("pt-BR") === "lista") {
      response = listUserTickets(db, conversationId, user);
    } else if (command.command === "consultar" && command.value) {
      response = handleTicketLookup(db, conversationId, user, command.value);
    } else if (command.command === "complementar") {
      response = askUpdateTarget(db, conversationId, user, command.value ? extractTicketNumber(command.value) : null);
    } else if (command.command === "abrir") {
      response = startCreationFromQuickAction(db, conversation, user, text);
    } else if (command.command === "faq") {
      response = handleFaq(db, conversationId, text,);
    } else if (/^(falar com um analista|quero falar com um analista)$/i.test(text)) {
      response = handleHandoff(db, conversation, user, "O funcionário pediu atendimento humano.", 0.99);
    } else {
      const decision = await routeMessage(text, db, {
        state: conversation.state,
        draft: conversation.draft,
        recentMessages: findRecentMessages(db, conversationId),
      });
      if (decision.mode === "local" && isOutOfScope(text)) {
        response = reply(db, conversationId, "Posso ajudar somente com solicitações de TI. Para RH, financeiro ou facilities, use os canais internos dessas áreas.", makeTrace(decision.intent, "redirecionou_fora_escopo", decision.confidence, decision.reason, "validar_escopo", "blocked"));
      } else if (decision.intent === "faq") {
        response = handleFaq(db, conversationId, text);
      } else if (decision.intent === "lookup") {
        response = handleTicketLookup(db, conversationId, user, text);
      } else if (decision.intent === "update") {
        const number = decision.ticketNumber ?? extractTicketNumber(text);
        response = beginUpdate(db, conversationId, user, number, text);
      } else if (decision.intent === "create") {
        response = createOrUpdateDraft(db, conversation, user, text);
      } else if (decision.intent === "handoff") {
        response = handleHandoff(db, conversation, user, decision.reason, decision.confidence, findTicketForTransfer(db, user, text));
      } else if (decision.intent === "out_of_scope") {
        response = reply(db, conversationId, "Posso ajudar somente com solicitações de TI. Para essa demanda, use os canais internos da área responsável.", makeTrace(decision.intent, "redirecionou_fora_escopo", decision.confidence, decision.reason, "validar_escopo", "blocked"));
      } else {
        response = handleHandoff(db, conversation, user, "Não consegui escolher uma ação com segurança; encaminhei o contexto ao Suporte N2.", decision.confidence);
      }
    }
    void response;
  } catch (error) {
    if (error instanceof ServiceError) {
      reply(db, conversationId, error.message, makeTrace("validação", "não_executou_ação", 0.99, error.message, "validar_regra_de_negocio", "blocked"));
    } else if (error instanceof AgentProviderError) {
      reply(db, conversationId, error.message, makeTrace("sistema", "falha_no_modelo", 0.3, error.message, "classificar_intencao", "error"));
    } else {
      console.error("Falha ao processar mensagem do Nexo Assist:", error);
      reply(db, conversationId, "O service desk não conseguiu concluir essa operação agora. Sua mensagem foi mantida; tente novamente em instantes.", makeTrace("sistema", "falha_de_ferramenta", 0.3, "A operação falhou antes de ser confirmada.", "tratar_falha", "error"));
    }
  }

  return {
    conversation: findConversationById(db, conversationId)!,
    messages: listMessages(db, conversationId),
  };
}

export function getConversationForUser(db: SqlDatabase, conversationId: string, user: User): { conversation: Conversation; messages: ChatMessage[] } {
  const conversation = assertOwnedConversation(db, conversationId, user);
  return { conversation, messages: listMessages(db, conversationId) };
}

export function newConversation(db: SqlDatabase, user: User): Conversation {
  const conversation = {
    id: newId(),
    userId: user.id,
    state: "agent" as const,
    draft: null,
    activeTicketId: null,
    assignedAnalystId: null,
    handoffReason: null,
    handoffSummary: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    sessionMessageCount: 0,
  };
  const result = db.prepare(`
    INSERT INTO conversations(id, user_id, state, created_at, updated_at, session_message_count)
    VALUES (?, ?, ?, ?, ?, 0)
  `).run(conversation.id, user.id, conversation.state, conversation.createdAt, conversation.updatedAt);
  void result;
  return findConversationById(db, conversation.id)!;
}

export function getSessionMessageLimit(): number {
  return sessionMessageLimit;
}
