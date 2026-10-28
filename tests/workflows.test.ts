import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  addMessage,
  createConversation,
  createDatabase,
  findConversationById,
  findTicketByNumber,
  findUserByEmail,
  listMessages,
  listTickets,
  updateConversation,
  type SqlDatabase,
} from "../src/server/db/database.ts";
import { seedDemoData } from "../src/server/db/seed.ts";
import { deleteConversationForUser, processUserMessage } from "../src/server/services/chat.ts";
import { routeMessage } from "../src/server/agent/router.ts";
import { closeConversation, getConsoleQueue, returnConversationToAgent, sendAnalystMessage, takeConversation } from "../src/server/services/console.ts";
import { ServiceError } from "../src/server/services/errors.ts";
import { createSessionToken, verifySessionToken } from "../src/server/auth/session.ts";
import { calculateSlaDueAt, isOverdue } from "../src/server/services/sla.ts";
import { inferPriority } from "../src/server/services/classification.ts";

interface Fixture {
  db: SqlDatabase;
  ana: NonNullable<ReturnType<typeof findUserByEmail>>;
  bruno: NonNullable<ReturnType<typeof findUserByEmail>>;
  analyst: NonNullable<ReturnType<typeof findUserByEmail>>;
  conversationId: string;
  close: () => void;
}

function fixture(): Fixture {
  const db = createDatabase(":memory:");
  seedDemoData(db);
  const ana = findUserByEmail(db, "ana.souza@nexo.com.br")!;
  const bruno = findUserByEmail(db, "bruno.tavares@nexo.com.br")!;
  const analyst = findUserByEmail(db, "rafael.lima@nexo.com.br")!;
  const conversation = createConversation(db, ana.id);
  return { db, ana, bruno, analyst, conversationId: conversation.id, close: () => db.close() };
}

test("FAQ returns an answer grounded in a seeded article", async (t) => {
  const f = fixture();
  t.after(f.close);
  const result = await processUserMessage(f.db, f.ana, f.conversationId, "Como redefino a senha da rede Nexo?");
  const answer = result.messages.at(-1)!;
  assert.match(answer.body, /portal de identidade/i);
  assert.equal(answer.decision?.tool, "buscar_central_de_ajuda");
  assert.equal(answer.decision?.outcome, "success");
});

test("ticket lookup lists only the signed-in employee's tickets", async (t) => {
  const f = fixture();
  t.after(f.close);
  const result = await processUserMessage(f.db, f.ana, f.conversationId, "Qual o status do meu chamado?");
  const answer = result.messages.at(-1)!;
  assert.match(answer.body, /chamados em andamento/i);
  assert.equal(answer.payload?.tickets?.length, 3);
  assert.ok(answer.payload?.tickets?.every((ticket) => ticket.ownerId === f.ana.id));

  const privateResult = await processUserMessage(f.db, f.ana, f.conversationId, "Mostre o INC-20460");
  assert.match(privateResult.messages.at(-1)!.body, /por privacidade/i);
  assert.equal(privateResult.messages.at(-1)!.decision?.outcome, "blocked");
});

test("Mastra mode routes clear ticket-status requests without waiting for the LLM", async (t) => {
  const f = fixture();
  const previousMode = process.env.NEXO_AGENT_MODE;
  const previousKey = process.env.OPENAI_API_KEY;
  t.after(() => {
    f.close();
    if (previousMode === undefined) delete process.env.NEXO_AGENT_MODE;
    else process.env.NEXO_AGENT_MODE = previousMode;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  });
  process.env.NEXO_AGENT_MODE = "mastra";
  process.env.OPENAI_API_KEY = "test-key";

  const decision = await routeMessage("Qual o status do meu chamado?", f.db, {
    state: "agent",
    draft: null,
    recentMessages: [],
  });

  assert.equal(decision.mode, "local");
  assert.equal(decision.intent, "lookup");
});

test("employee can delete their inactive conversation but not another user's or a live handoff", (t) => {
  const f = fixture();
  t.after(f.close);
  const ticketsBefore = listTickets(f.db, f.ana.id).length;
  const ownConversation = createConversation(f.db, f.ana.id);
  addMessage(f.db, {
    conversationId: ownConversation.id,
    senderId: f.ana.id,
    senderRole: "employee",
    body: "Mensagem de demonstração",
    actions: [],
    decision: null,
  });

  deleteConversationForUser(f.db, ownConversation.id, f.ana);

  assert.equal(findConversationById(f.db, ownConversation.id), null);
  assert.deepEqual(listMessages(f.db, ownConversation.id), []);
  assert.equal(listTickets(f.db, f.ana.id).length, ticketsBefore);

  const otherConversation = createConversation(f.db, f.bruno.id);
  assert.throws(
    () => deleteConversationForUser(f.db, otherConversation.id, f.ana),
    (error: unknown) => error instanceof ServiceError && error.code === "CONVERSATION_NOT_FOUND",
  );

  const liveHandoff = createConversation(f.db, f.ana.id);
  updateConversation(f.db, liveHandoff.id, { state: "waiting" });
  assert.throws(
    () => deleteConversationForUser(f.db, liveHandoff.id, f.ana),
    (error: unknown) => error instanceof ServiceError && error.code === "CONVERSATION_ACTIVE",
  );
  assert.equal(findConversationById(f.db, liveHandoff.id)?.state, "waiting");
});

test("valid update is staged, confirmed, persisted, and invalid ownership is rejected", async (t) => {
  const f = fixture();
  t.after(f.close);
  const before = findTicketByNumber(f.db, f.ana.id, "INC-20311")!;
  const staged = await processUserMessage(f.db, f.ana, f.conversationId, "Quero complementar INC-20311: o reinício não resolveu e agora ocorre erro ao abrir o relatório.");
  assert.equal(staged.conversation.draft?.operation, "update");
  assert.match(staged.messages.at(-1)!.body, /Confira o rascunho/);
  assert.equal(findTicketByNumber(f.db, f.ana.id, "INC-20311")?.description, before.description);

  const saved = await processUserMessage(f.db, f.ana, f.conversationId, "confirmar");
  assert.match(saved.messages.at(-1)!.body, /Atualizei o chamado INC-20311/);
  assert.match(findTicketByNumber(f.db, f.ana.id, "INC-20311")!.description, /erro ao abrir o relatório/);

  const otherConversation = createConversation(f.db, f.ana.id);
  const rejected = await processUserMessage(f.db, f.ana, otherConversation.id, "Quero complementar INC-20460: o Wi-Fi continua fora do ar.");
  assert.match(rejected.messages.at(-1)!.body, /não encontrei esse chamado/i);
  assert.equal(findTicketByNumber(f.db, f.bruno.id, "INC-20460")?.description, "Equipe comercial sem conexão Wi-Fi no andar 4.");
});

test("an open duplicate is updated instead of creating a second ticket", async (t) => {
  const f = fixture();
  t.after(f.close);
  const beforeCount = listTickets(f.db, f.ana.id).length;
  const staged = await processUserMessage(f.db, f.ana, f.conversationId, "Meu notebook continua lento após atualização do Windows, mesmo depois de reiniciar.");
  assert.equal(staged.conversation.draft?.operation, "update");
  assert.equal(staged.conversation.draft?.ticketNumber, "INC-20311");
  assert.match(staged.messages.at(-1)!.body, /evitar duplicidade/i);
  await processUserMessage(f.db, f.ana, f.conversationId, "confirmar");
  assert.equal(listTickets(f.db, f.ana.id).length, beforeCount);
  assert.match(findTicketByNumber(f.db, f.ana.id, "INC-20311")!.description, /mesmo depois de reiniciar/i);
});

test("a recently resolved matching ticket can be reopened within seven days", async (t) => {
  const f = fixture();
  t.after(f.close);
  const staged = await processUserMessage(f.db, f.ana, f.conversationId, "A senha do SAP está bloqueada novamente.");
  assert.equal(staged.conversation.draft?.operation, "reopen");
  assert.equal(staged.conversation.draft?.ticketNumber, "INC-20150");
  await processUserMessage(f.db, f.ana, f.conversationId, "confirmar");
  assert.equal(findTicketByNumber(f.db, f.ana.id, "INC-20150")?.status, "Reaberto");
});

test("a resolved ticket outside the seven-day window cannot be updated", async (t) => {
  const f = fixture();
  t.after(f.close);
  const result = await processUserMessage(f.db, f.ana, f.conversationId, "Quero complementar INC-19877: continua sem sincronizar.");
  assert.match(result.messages.at(-1)!.body, /mais de 7 dias/i);
  assert.equal(result.messages.at(-1)!.decision?.outcome, "blocked");
});

test("ticket opening collects a concrete description and impact, then creates only after confirmation", async (t) => {
  const f = fixture();
  t.after(f.close);
  const start = await processUserMessage(f.db, f.ana, f.conversationId, "Preciso abrir um chamado");
  assert.equal(start.conversation.draft?.awaitingDescription, true);
  assert.match(start.messages.at(-1)!.body, /O que está acontecendo/);

  const details = await processUserMessage(f.db, f.ana, f.conversationId, "Meu notebook não conecta na VPN e mostra erro 809 no Windows 11. Tenho reunião com cliente hoje.");
  assert.equal(details.conversation.draft?.category, "Rede e VPN");
  assert.equal(details.conversation.draft?.priority, "Alta");
  assert.equal(details.conversation.draft?.affectedScope, "Só você");
  assert.match(details.messages.at(-1)!.body, /Confira o rascunho/);
  assert.equal(listTickets(f.db, f.ana.id).filter((ticket) => ticket.number.startsWith("INC-205")).length, 0);

  const saved = await processUserMessage(f.db, f.ana, f.conversationId, "confirmar");
  const newTicket = saved.messages.at(-1)!.payload?.ticket;
  assert.ok(newTicket);
  assert.equal(newTicket.ownerId, f.ana.id);
  assert.equal(newTicket.category, "Rede e VPN");
  assert.equal(newTicket.priority, "Alta");
  assert.equal(newTicket.status, "Novo");
  assert.equal(saved.conversation.draft, null);
});

test("editing a new-ticket draft replaces its description and recalculates its classification", async (t) => {
  const f = fixture();
  t.after(f.close);
  const first = await processUserMessage(f.db, f.ana, f.conversationId, "Meu notebook não conecta na VPN e mostra erro 809 no Windows 11.");
  assert.equal(first.conversation.draft?.operation, "create");
  await processUserMessage(f.db, f.ana, f.conversationId, "editar");
  assert.equal(findConversationById(f.db, f.conversationId)?.draft?.awaitingEdit, true);
  const corrected = await processUserMessage(f.db, f.ana, f.conversationId, "Meu notebook não conecta na VPN e mostra erro 809 no Windows 10. Tenho reunião com cliente hoje.");
  assert.match(corrected.conversation.draft?.description ?? "", /Windows 10/);
  assert.doesNotMatch(corrected.conversation.draft?.description ?? "", /Windows 11/);
  assert.equal(corrected.conversation.draft?.priority, "Alta");
});

test("human request transfers the conversation and pauses the agent", async (t) => {
  const f = fixture();
  t.after(f.close);
  const result = await processUserMessage(f.db, f.ana, f.conversationId, "Quero falar com um analista sobre o INC-20311");
  assert.equal(result.conversation.state, "waiting");
  assert.match(result.messages.at(-1)!.body, /Encaminhei sua conversa/);
  await assert.rejects(
    processUserMessage(f.db, f.ana, f.conversationId, "Ainda está parado"),
    (error: unknown) => error instanceof ServiceError && error.code === "AGENT_PAUSED",
  );
});

test("invalid messages and tool failures return controlled errors", async (t) => {
  const f = fixture();
  t.after(f.close);
  await assert.rejects(processUserMessage(f.db, f.ana, f.conversationId, "   "), (error: unknown) => error instanceof ServiceError && error.code === "MESSAGE_EMPTY");
  await assert.rejects(processUserMessage(f.db, f.ana, f.conversationId, "x".repeat(2001)), (error: unknown) => error instanceof ServiceError && error.code === "MESSAGE_TOO_LONG");

  const brokenDb = new Proxy(f.db, {
    get(target, property) {
      if (property === "prepare") return (sql: string) => {
        if (sql.includes("knowledge_articles")) throw new Error("simulated local knowledge service outage");
        return target.prepare(sql);
      };
      const value = Reflect.get(target, property) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const originalConsoleError = console.error;
  let failed: Awaited<ReturnType<typeof processUserMessage>>;
  console.error = () => undefined;
  try {
    failed = await processUserMessage(brokenDb, f.ana, f.conversationId, "Como redefino a senha da rede?");
  } finally {
    console.error = originalConsoleError;
  }
  assert.match(failed.messages.at(-1)!.body, /não conseguiu concluir essa operação/i);
  assert.equal(failed.messages.at(-1)!.decision?.outcome, "error");
});

test("demo seed is idempotent and contains the required evaluation fixtures", (t) => {
  const db = createDatabase(":memory:");
  t.after(() => db.close());
  seedDemoData(db);
  const before = db.prepare("SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM tickets) AS tickets, (SELECT count(*) FROM knowledge_articles) AS articles, (SELECT count(*) FROM messages) AS messages").get() as Record<string, number>;
  assert.equal(before.users, 9);
  assert.equal(before.tickets, 8);
  assert.equal(before.articles, 8);
  assert.equal(before.messages, 7);
  seedDemoData(db);
  const after = db.prepare("SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM tickets) AS tickets, (SELECT count(*) FROM knowledge_articles) AS articles, (SELECT count(*) FROM messages) AS messages").get() as Record<string, number>;
  assert.deepEqual(after, before);
});

test("conversation and messages survive closing and reopening SQLite", (t) => {
  const folder = mkdtempSync(join(tmpdir(), "nexo-assist-test-"));
  const location = join(folder, "demo.sqlite");
  const first = createDatabase(location);
  seedDemoData(first);
  const ana = findUserByEmail(first, "ana.souza@nexo.com.br")!;
  const conversation = createConversation(first, ana.id);
  const id = conversation.id;
  first.prepare(`INSERT INTO messages(id, conversation_id, sender_id, sender_role, body, created_at) VALUES ('persist-test', ?, ?, 'employee', 'persistir mensagem', ?)`).run(id, ana.id, new Date().toISOString());
  first.close();

  const second = createDatabase(location);
  t.after(() => { second.close(); rmSync(folder, { recursive: true, force: true }); });
  const recovered = findConversationById(second, id);
  assert.equal(recovered?.userId, ana.id);
  const stored = second.prepare("SELECT body FROM messages WHERE id = 'persist-test'").get() as { body: string };
  assert.equal(stored.body, "persistir mensagem");
});

test("analyst can take, reply, and return a transferred conversation", (t) => {
  const f = fixture();
  t.after(f.close);
  const item = getConsoleQueue(f.db, f.analyst).find((entry) => entry.conversation.id === "conversation-ana-overdue");
  assert.ok(item);
  const taken = takeConversation(f.db, f.analyst, item.conversation.id);
  assert.equal(taken.state, "human");
  assert.equal(taken.assignedAnalystId, f.analyst.id);
  const message = sendAnalystMessage(f.db, f.analyst, item.conversation.id, "Oi, Ana. Vou verificar o notebook remotamente.");
  assert.equal(message.senderRole, "analyst");
  const returned = returnConversationToAgent(f.db, f.analyst, item.conversation.id);
  assert.equal(returned.state, "agent");
  assert.equal(returned.assignedAnalystId, null);
});

test("only the assigned analyst can close a conversation", (t) => {
  const f = fixture();
  t.after(f.close);
  takeConversation(f.db, f.analyst, "conversation-ana-overdue");
  const closed = closeConversation(f.db, f.analyst, "conversation-ana-overdue");
  assert.equal(closed.state, "closed");
  assert.throws(() => closeConversation(f.db, f.analyst, "conversation-ana-overdue"), ServiceError);
});

test("session token is signed, expires, and carries only the authenticated identity", (t) => {
  const f = fixture();
  t.after(f.close);
  const now = Date.now();
  const token = createSessionToken(f.ana, now);
  const payload = verifySessionToken(token, now);
  assert.equal(payload?.userId, f.ana.id);
  assert.equal(payload?.role, "employee");
  assert.equal(verifySessionToken(`${token}x`, now), null);
  assert.equal(verifySessionToken(token, now + 13 * 60 * 60 * 1000), null);
});

test("priority rules and SLA deadlines follow the documented business schedule", () => {
  assert.equal(inferPriority("A empresa sem internet e todos pararam de trabalhar", "Toda a empresa", "INC"), "Crítica");
  assert.equal(inferPriority("Meu notebook está lento, mas consigo trabalhar", "Só você", "INC"), "Média");
  const fridayAtFourPm = new Date("2026-10-23T19:00:00.000Z"); // 16:00 in America/Bahia.
  const highDueAt = new Date(calculateSlaDueAt("Alta", fridayAtFourPm));
  const highLocal = new Intl.DateTimeFormat("en-US", { timeZone: "America/Bahia", weekday: "short", hour: "2-digit", hourCycle: "h23" }).format(highDueAt);
  assert.match(highLocal, /^Mon, 10$/); // Two hours on Friday and two on Monday.
  const criticalDueAt = new Date(calculateSlaDueAt("Crítica", fridayAtFourPm));
  assert.equal(criticalDueAt.getTime() - fridayAtFourPm.getTime(), 60 * 60_000);
  assert.equal(isOverdue(new Date(fridayAtFourPm.getTime() - 1).toISOString(), fridayAtFourPm), true);
});
