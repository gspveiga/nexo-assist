export type UserRole = "employee" | "analyst";
export type ConversationState = "agent" | "waiting" | "human" | "closed";
export type TicketType = "INC" | "REQ";
export type TicketPriority = "Crítica" | "Alta" | "Média" | "Baixa";
export type TicketCategory = "Acesso" | "Rede e VPN" | "Hardware" | "Software" | "E-mail" | "Outros";
export type AffectedScope = "Só você" | "Minha equipe" | "Toda a empresa" | "Não sei";

export interface User {
  id: string;
  email: string;
  name: string;
  department: string;
  role: UserRole;
}

export interface Ticket {
  id: string;
  number: string;
  ownerId: string;
  ownerName?: string;
  title: string;
  description: string;
  type: TicketType;
  category: TicketCategory;
  priority: TicketPriority;
  status: string;
  affectedScope: AffectedScope;
  assignedGroup: string;
  createdAt: string;
  updatedAt: string;
  slaDueAt: string;
  lastUpdateSummary: string;
}

export interface TicketDraft {
  operation: "create" | "update" | "reopen";
  title: string;
  description: string;
  type: TicketType;
  category: TicketCategory;
  priority: TicketPriority;
  affectedScope: AffectedScope | null;
  ticketId?: string;
  ticketNumber?: string;
  pendingNote?: string;
  awaitingNote?: boolean;
  awaitingDescription?: boolean;
  awaitingEdit?: boolean;
  sourceMessage: string;
  reason: string;
}

export interface QuickAction {
  label: string;
  value: string;
}

export interface DecisionTrace {
  intent: string;
  action: string;
  confidence: number;
  reason: string;
  tool?: string;
  outcome?: "success" | "needs_input" | "blocked" | "error";
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string | null;
  senderRole: "employee" | "assistant" | "analyst" | "system";
  body: string;
  actions: QuickAction[];
  decision: DecisionTrace | null;
  payload?: { ticket?: Ticket; tickets?: Ticket[]; draft?: TicketDraft };
  createdAt: string;
}

export interface Conversation {
  id: string;
  userId: string;
  state: ConversationState;
  draft: TicketDraft | null;
  activeTicketId: string | null;
  assignedAnalystId: string | null;
  handoffReason: string | null;
  handoffSummary: string | null;
  createdAt: string;
  updatedAt: string;
  sessionMessageCount: number;
  messages?: ChatMessage[];
}

export interface KnowledgeArticle {
  id: string;
  title: string;
  content: string;
  category: TicketCategory;
  keywords: string[];
}

export interface ApiError {
  error: string;
  code?: string;
}
