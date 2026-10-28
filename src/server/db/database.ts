import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  ChatMessage,
  Conversation,
  KnowledgeArticle,
  Ticket,
  User,
} from "@/shared/types";

type SqlValue = string | number | bigint | Uint8Array | null;
interface SqlStatement {
  run(...values: SqlValue[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  get(...values: SqlValue[]): unknown;
  all(...values: SqlValue[]): unknown[];
}
export interface SqlDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqlStatement;
  close(): void;
}
const migrationVersion = "001_initial";

export function resolveDatabaseFilePath(location = process.env.DB_PATH ?? "./data/nexo-assist.sqlite"): string {
  return location === ":memory:" ? location : isAbsolute(location) ? location : join(process.cwd(), "data", basename(location));
}

export function createDatabase(location = process.env.DB_PATH ?? "./data/nexo-assist.sqlite"): SqlDatabase {
  const absolutePath = resolveDatabaseFilePath(location);
  if (absolutePath !== ":memory:") mkdirSync(dirname(absolutePath), { recursive: true });

  const db = new DatabaseSync(absolutePath);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  if (absolutePath !== ":memory:") db.exec("PRAGMA journal_mode = WAL;");
  migrate(db);
  return db;
}

export function migrate(db: SqlDatabase): void {
  const migration = readFileSync(join(process.cwd(), "migrations", "001_initial.sql"), "utf8");
  db.exec(migration);
  db.prepare("INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (?, ?)")
    .run(migrationVersion, nowIso());
}

let singleton: SqlDatabase | undefined;
export function getDatabase(): SqlDatabase {
  singleton ??= createDatabase();
  return singleton;
}

export function closeDatabase(): void {
  singleton?.close();
  singleton = undefined;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(): string {
  return randomUUID();
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function userFromRow(row: Record<string, unknown>): User {
  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name),
    department: String(row.department),
    role: row.role === "analyst" ? "analyst" : "employee",
  };
}

function ticketFromRow(row: Record<string, unknown>): Ticket {
  return {
    id: String(row.id),
    number: String(row.number),
    ownerId: String(row.owner_id),
    ownerName: row.owner_name == null ? undefined : String(row.owner_name),
    title: String(row.title),
    description: String(row.description),
    type: row.type === "REQ" ? "REQ" : "INC",
    category: String(row.category) as Ticket["category"],
    priority: String(row.priority) as Ticket["priority"],
    status: String(row.status),
    affectedScope: String(row.affected_scope) as Ticket["affectedScope"],
    assignedGroup: String(row.assigned_group),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    slaDueAt: String(row.sla_due_at),
    lastUpdateSummary: String(row.last_update_summary ?? ""),
  };
}

export function findUserByEmail(db: SqlDatabase, email: string): User | null {
  const row = db.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE").get(email) as Record<string, unknown> | undefined;
  return row ? userFromRow(row) : null;
}

export function findUserById(db: SqlDatabase, id: string): User | null {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? userFromRow(row) : null;
}

export function listUsers(db: SqlDatabase, role?: User["role"]): User[] {
  const rows = role
    ? db.prepare("SELECT * FROM users WHERE role = ? ORDER BY name").all(role)
    : db.prepare("SELECT * FROM users ORDER BY name").all();
  return rows.map((row) => userFromRow(row as Record<string, unknown>));
}

export function listTickets(db: SqlDatabase, ownerId: string): Ticket[] {
  const rows = db.prepare(`
    SELECT t.*, u.name AS owner_name FROM tickets t
    JOIN users u ON u.id = t.owner_id
    WHERE t.owner_id = ?
    ORDER BY t.updated_at DESC
  `).all(ownerId);
  return rows.map((row) => ticketFromRow(row as Record<string, unknown>));
}

export function listAllTickets(db: SqlDatabase): Ticket[] {
  const rows = db.prepare(`
    SELECT t.*, u.name AS owner_name FROM tickets t
    JOIN users u ON u.id = t.owner_id
    ORDER BY t.updated_at DESC
  `).all();
  return rows.map((row) => ticketFromRow(row as Record<string, unknown>));
}

export function findTicketByNumber(db: SqlDatabase, ownerId: string, number: string): Ticket | null {
  const row = db.prepare(`
    SELECT t.*, u.name AS owner_name FROM tickets t
    JOIN users u ON u.id = t.owner_id
    WHERE t.owner_id = ? AND upper(t.number) = upper(?)
  `).get(ownerId, number) as Record<string, unknown> | undefined;
  return row ? ticketFromRow(row) : null;
}

export function findTicketById(db: SqlDatabase, id: string): Ticket | null {
  const row = db.prepare(`
    SELECT t.*, u.name AS owner_name FROM tickets t
    JOIN users u ON u.id = t.owner_id WHERE t.id = ?
  `).get(id) as Record<string, unknown> | undefined;
  return row ? ticketFromRow(row) : null;
}

export function updateTicketRecord(
  db: SqlDatabase,
  ticketId: string,
  changes: { description: string; summary: string; status?: string; priority?: Ticket["priority"]; slaDueAt: string },
): void {
  db.prepare(`
    UPDATE tickets SET description = ?, last_update_summary = ?, updated_at = ?, sla_due_at = ?,
      status = COALESCE(?, status), priority = COALESCE(?, priority)
    WHERE id = ?
  `).run(
    changes.description,
    changes.summary,
    nowIso(),
    changes.slaDueAt,
    changes.status ?? null,
    changes.priority ?? null,
    ticketId,
  );
}

export function createTicketRecord(
  db: SqlDatabase,
  ticket: Omit<Ticket, "id" | "createdAt" | "updatedAt" | "ownerName" | "lastUpdateSummary">,
): Ticket {
  const id = newId();
  const timestamp = nowIso();
  db.prepare(`
    INSERT INTO tickets(id, number, owner_id, title, description, type, category, priority, status,
      affected_scope, assigned_group, created_at, updated_at, sla_due_at, last_update_summary)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, ticket.number, ticket.ownerId, ticket.title, ticket.description, ticket.type,
    ticket.category, ticket.priority, ticket.status, ticket.affectedScope, ticket.assignedGroup,
    timestamp, timestamp, ticket.slaDueAt, "Chamado criado pelo Nexo Assist.",
  );
  const saved = findTicketById(db, id);
  if (!saved) throw new Error("O chamado foi inserido, mas não pôde ser lido novamente.");
  return saved;
}

export function listArticles(db: SqlDatabase): KnowledgeArticle[] {
  return db.prepare("SELECT * FROM knowledge_articles ORDER BY title").all().map((item) => {
    const row = item as Record<string, unknown>;
    return {
      id: String(row.id),
      title: String(row.title),
      content: String(row.content),
      category: String(row.category) as KnowledgeArticle["category"],
      keywords: parseJson<string[]>(row.keywords_json, []),
    };
  });
}

function conversationFromRow(row: Record<string, unknown>): Conversation {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    state: String(row.state) as Conversation["state"],
    draft: parseJson(row.draft_json, null),
    activeTicketId: row.active_ticket_id == null ? null : String(row.active_ticket_id),
    assignedAnalystId: row.assigned_analyst_id == null ? null : String(row.assigned_analyst_id),
    handoffReason: row.handoff_reason == null ? null : String(row.handoff_reason),
    handoffSummary: row.handoff_summary == null ? null : String(row.handoff_summary),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    sessionMessageCount: Number(row.session_message_count),
  };
}

export function createConversation(db: SqlDatabase, userId: string): Conversation {
  const id = newId();
  const timestamp = nowIso();
  db.prepare(`
    INSERT INTO conversations(id, user_id, state, created_at, updated_at, session_message_count)
    VALUES (?, ?, 'agent', ?, ?, 0)
  `).run(id, userId, timestamp, timestamp);
  return findConversationById(db, id)!;
}

export function findConversationById(db: SqlDatabase, id: string): Conversation | null {
  const row = db.prepare("SELECT * FROM conversations WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? conversationFromRow(row) : null;
}

export function listConversationsForUser(db: SqlDatabase, userId: string): Conversation[] {
  return db.prepare(`
    SELECT * FROM conversations WHERE user_id = ? ORDER BY updated_at DESC
  `).all(userId).map((row) => conversationFromRow(row as Record<string, unknown>));
}

export function deleteConversationRecord(db: SqlDatabase, conversationId: string, userId: string): boolean {
  const result = db.prepare(`
    DELETE FROM conversations
    WHERE id = ? AND user_id = ? AND state IN ('agent', 'closed')
  `).run(conversationId, userId);
  return Number(result.changes) === 1;
}

export function listQueueConversations(db: SqlDatabase): Conversation[] {
  return db.prepare(`
    SELECT * FROM conversations WHERE state IN ('waiting', 'human') ORDER BY updated_at ASC
  `).all().map((row) => conversationFromRow(row as Record<string, unknown>));
}

export function updateConversation(
  db: SqlDatabase,
  id: string,
  changes: Partial<Pick<Conversation, "state" | "draft" | "activeTicketId" | "assignedAnalystId" | "handoffReason" | "handoffSummary">>,
): void {
  const current = findConversationById(db, id);
  if (!current) throw new Error("Conversa não encontrada.");
  const updated = { ...current, ...changes };
  db.prepare(`
    UPDATE conversations SET state = ?, draft_json = ?, active_ticket_id = ?, assigned_analyst_id = ?,
      handoff_reason = ?, handoff_summary = ?, updated_at = ? WHERE id = ?
  `).run(
    updated.state,
    updated.draft ? JSON.stringify(updated.draft) : null,
    updated.activeTicketId,
    updated.assignedAnalystId,
    updated.handoffReason,
    updated.handoffSummary,
    nowIso(),
    id,
  );
}

export function incrementSessionCount(db: SqlDatabase, id: string, amount = 1): number {
  db.prepare(`
    UPDATE conversations SET session_message_count = session_message_count + ?, updated_at = ? WHERE id = ?
  `).run(amount, nowIso(), id);
  return findConversationById(db, id)?.sessionMessageCount ?? 0;
}

export function addMessage(
  db: SqlDatabase,
  input: Omit<ChatMessage, "id" | "createdAt">,
): ChatMessage {
  const message: ChatMessage = { ...input, id: newId(), createdAt: nowIso() };
  db.prepare(`
    INSERT INTO messages(id, conversation_id, sender_id, sender_role, body, actions_json, decision_json, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    message.id,
    message.conversationId,
    message.senderId,
    message.senderRole,
    message.body,
    JSON.stringify(message.actions),
    message.decision ? JSON.stringify(message.decision) : null,
    message.payload ? JSON.stringify(message.payload) : null,
    message.createdAt,
  );
  return message;
}

export function listMessages(db: SqlDatabase, conversationId: string): ChatMessage[] {
  return db.prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at, rowid").all(conversationId)
    .map((item) => {
      const row = item as Record<string, unknown>;
      return {
        id: String(row.id),
        conversationId: String(row.conversation_id),
        senderId: row.sender_id == null ? null : String(row.sender_id),
        senderRole: String(row.sender_role) as ChatMessage["senderRole"],
        body: String(row.body),
        actions: parseJson(row.actions_json, []),
        decision: parseJson(row.decision_json, null),
        payload: parseJson(row.payload_json, undefined),
        createdAt: String(row.created_at),
      };
    });
}

export function recordConversationEvent(
  db: SqlDatabase,
  conversationId: string,
  actorId: string | null,
  eventType: string,
  details: Record<string, unknown> = {},
): void {
  db.prepare(`
    INSERT INTO conversation_events(id, conversation_id, actor_id, event_type, details_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(newId(), conversationId, actorId, eventType, JSON.stringify(details), nowIso());
}

export function countConversationEvents(db: SqlDatabase, conversationId: string, eventType: string): number {
  const row = db.prepare("SELECT COUNT(*) AS total FROM conversation_events WHERE conversation_id = ? AND event_type = ?")
    .get(conversationId, eventType) as { total: number };
  return Number(row.total);
}
