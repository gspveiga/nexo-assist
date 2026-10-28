CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  department TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('employee', 'analyst')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  owner_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('INC', 'REQ')),
  category TEXT NOT NULL CHECK (category IN ('Acesso', 'Rede e VPN', 'Hardware', 'Software', 'E-mail', 'Outros')),
  priority TEXT NOT NULL CHECK (priority IN ('Crítica', 'Alta', 'Média', 'Baixa')),
  status TEXT NOT NULL,
  affected_scope TEXT NOT NULL CHECK (affected_scope IN ('Só você', 'Minha equipe', 'Toda a empresa', 'Não sei')),
  assigned_group TEXT NOT NULL DEFAULT 'Suporte N1',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sla_due_at TEXT NOT NULL,
  last_update_summary TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_tickets_owner_updated ON tickets(owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_status_due ON tickets(status, sla_due_at);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  state TEXT NOT NULL CHECK (state IN ('agent', 'waiting', 'human', 'closed')),
  draft_json TEXT,
  active_ticket_id TEXT REFERENCES tickets(id),
  assigned_analyst_id TEXT REFERENCES users(id),
  handoff_reason TEXT,
  handoff_summary TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  session_message_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_state_updated ON conversations(state, updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id TEXT REFERENCES users(id),
  sender_role TEXT NOT NULL CHECK (sender_role IN ('employee', 'assistant', 'analyst', 'system')),
  body TEXT NOT NULL,
  actions_json TEXT NOT NULL DEFAULT '[]',
  decision_json TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS knowledge_articles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL,
  keywords_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversation_events (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES users(id),
  event_type TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_conversation_created ON conversation_events(conversation_id, created_at);
